"""
Novu bridge client for the HRMS notification-service.

Drop-in, best-effort delivery adapter: given the same data the existing
`POST /api/v1/notifications` endpoint already receives, it fires a Novu workflow
trigger. Every failure is swallowed and logged — a Novu outage must never break
the business action (same semantic as `shared/utils/notify.py` today).

Multi-tenancy: Novu subscribers are flat, so tenancy is encoded in the subscriber
id as ``"<tenant_id>:<identity_user_id>"``. Novu upserts the subscriber lazily on
first trigger; email/name are passed through so the subscriber profile is filled
in without a separate provisioning step.

Wire-up (see bridge/config.md):
    NOTIFY_ENGINE = legacy | dual | novu     # gate; this client is only called for dual/novu
    NOVU_API_URL  = http://host.docker.internal:3010
    NOVU_SECRET_KEY = <environment secret key from the Novu dashboard>
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

from .settings import settings

logger = logging.getLogger(__name__)

# Category (HRMS NotificationCategory) -> Novu workflow identifier.
# Unmapped categories fall back to the generic workflow.
_CATEGORY_WORKFLOW = {
    "timesheet": "hrms-timesheet",
    "task": "hrms-task",
    "approval": "hrms-approval",
    "announcement": "hrms-announcement",
}
_DEFAULT_WORKFLOW = "hrms-generic"

# Per-tenant SMTP: map tenant subdomain -> Novu SMTP integration identifier.
# Empty by default → Novu uses the environment's primary email integration.
# In production this is sourced from the tenant's encrypted SMTP settings.
_TENANT_EMAIL_INTEGRATION: dict[str, str] = {}


def workflow_for_category(category: Optional[str]) -> str:
    return _CATEGORY_WORKFLOW.get((category or "").lower(), _DEFAULT_WORKFLOW)


def build_subscriber_id(tenant_id: str, recipient_id: str) -> str:
    """Deterministic, PII-free, collision-proof across tenants."""
    return f"{tenant_id}:{recipient_id}"


class NovuClient:
    """Thin async wrapper over the Novu trigger API. Fire-and-forget."""

    def __init__(
        self,
        api_url: Optional[str] = None,
        secret_key: Optional[str] = None,
        timeout: Optional[float] = None,
    ) -> None:
        self._api_url = (api_url or settings.api_url).rstrip("/")
        self._secret_key = secret_key or settings.secret_key
        self._timeout = timeout if timeout is not None else settings.timeout_seconds

    @property
    def enabled(self) -> bool:
        return bool(self._api_url and self._secret_key)

    async def trigger(
        self,
        *,
        tenant_id: str,
        recipient_id: str,
        title: str,
        message: str,
        category: Optional[str] = None,
        priority: str = "normal",
        action_url: Optional[str] = None,
        tenant_subdomain: Optional[str] = None,
        recipient_email: Optional[str] = None,
        recipient_name: Optional[str] = None,
        channels: Optional[dict[str, bool]] = None,
        extra_payload: Optional[dict[str, Any]] = None,
    ) -> bool:
        """Fire a Novu workflow. Returns True on 2xx, False on any failure.

        Never raises: notifications are side effects.
        """
        if not self.enabled:
            logger.debug("novu: client not configured (NOVU_API_URL/NOVU_SECRET_KEY missing); skipping")
            return False

        workflow_id = workflow_for_category(category)
        subscriber: dict[str, Any] = {"subscriberId": build_subscriber_id(tenant_id, recipient_id)}
        if recipient_email:
            subscriber["email"] = recipient_email
        if recipient_name:
            # Novu stores first/last name separately; keep it simple for the POC.
            subscriber["firstName"] = recipient_name

        payload: dict[str, Any] = {
            "title": title,
            "message": message,
            "category": category,
            "priority": priority,
            "action_url": action_url,
            "tenant_id": tenant_id,
            "tenant_subdomain": tenant_subdomain,
            "channels": channels or {"in_app": True, "email": True},
        }
        if extra_payload:
            payload.update(extra_payload)

        body: dict[str, Any] = {"name": workflow_id, "to": subscriber, "payload": payload}

        # Per-tenant SMTP selection (optional).
        integration = _TENANT_EMAIL_INTEGRATION.get((tenant_subdomain or "").lower())
        if integration:
            body["overrides"] = {"email": {"integrationIdentifier": integration}}

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(
                    f"{self._api_url}/v1/events/trigger",
                    headers={"Authorization": f"ApiKey {self._secret_key}"},
                    json=body,
                )
            if resp.status_code // 100 == 2:
                logger.info(
                    "novu: triggered %s for subscriber %s (status %s)",
                    workflow_id, subscriber["subscriberId"], resp.status_code,
                )
                return True
            logger.warning(
                "novu: trigger %s failed status=%s body=%s",
                workflow_id, resp.status_code, resp.text[:500],
            )
            return False
        except Exception as exc:  # noqa: BLE001 — best-effort by design
            logger.warning("novu: trigger %s errored (swallowed): %r", workflow_id, exc)
            return False

    async def delete_subscriber(self, *, tenant_id: str, recipient_id: str) -> bool:
        """Remove a subscriber — used by the GDPR erase cascade (dsr.py). Best-effort."""
        if not self.enabled:
            return False
        sub_id = build_subscriber_id(tenant_id, recipient_id)
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.delete(
                    f"{self._api_url}/v1/subscribers/{sub_id}",
                    headers={"Authorization": f"ApiKey {self._secret_key}"},
                )
            return resp.status_code // 100 == 2
        except Exception as exc:  # noqa: BLE001
            logger.warning("novu: delete_subscriber %s errored (swallowed): %r", sub_id, exc)
            return False


# Module-level singleton for convenience (mirrors how notify.py grabs shared clients).
novu_client = NovuClient()
