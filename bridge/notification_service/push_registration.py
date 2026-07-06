"""
Channel-agnostic push device registration.

A subscriber (one HRMS user, in one tenant) can carry device tokens for several push
providers at once. HRMS just needs to forward whatever token the client obtained to
Novu against the matching provider; Novu fans out to the right push service at send time.

Providers (verified present in Novu 3.17 community build):
    FCM          — Firebase: web browsers AND Android      (recommended default)
    APNS         — Apple Push Notification service: native iOS
    EXPO         — Expo Push: React Native apps
    ONE_SIGNAL   — OneSignal
    PUSH_WEBHOOK — generic webhook: Novu POSTs to a URL you control (fully local; great for POC/testing)

Endpoint used (verified):
    PATCH /v1/subscribers/{subscriberId}/credentials
        { "providerId": "<id>", "credentials": { "deviceTokens": ["..."] }, "integrationIdentifier"?: "..." }
    DELETE /v1/subscribers/{subscriberId}/credentials/{providerId}

This is the same subscriber model as in-app/email — the composite subscriberId keeps
tenants isolated. Adding a mobile app later is purely additive: the app registers an
APNS/Expo/FCM token through this exact path; no server changes.
"""

from __future__ import annotations

import logging
from enum import Enum
from typing import Optional

import httpx

from .novu_client import build_subscriber_id
from .settings import settings

logger = logging.getLogger(__name__)


class PushProvider(str, Enum):
    FCM = "fcm"                # web + Android
    APNS = "apns"             # iOS
    EXPO = "expo"             # React Native (Expo)
    ONE_SIGNAL = "one-signal"
    PUSH_WEBHOOK = "push-webhook"  # local/self-hosted webhook sink


async def register_device(
    *,
    tenant_id: str,
    user_id: str,
    device_token: str,
    provider: PushProvider = PushProvider.FCM,
    integration_identifier: Optional[str] = None,
) -> bool:
    """Attach a push device token to the subscriber. Best-effort; never raises."""
    if not settings.enabled:
        logger.debug("push: bridge disabled; skipping device registration")
        return False

    sub_id = build_subscriber_id(tenant_id, user_id)
    body: dict = {
        "providerId": provider.value,
        "credentials": {"deviceTokens": [device_token]},
    }
    if integration_identifier:
        body["integrationIdentifier"] = integration_identifier

    try:
        async with httpx.AsyncClient(timeout=settings.timeout_seconds) as client:
            resp = await client.patch(
                f"{settings.api_url}/v1/subscribers/{sub_id}/credentials",
                headers={"Authorization": f"ApiKey {settings.secret_key}"},
                json=body,
            )
        if resp.status_code // 100 == 2:
            logger.info("push: registered %s token for %s", provider.value, sub_id)
            return True
        logger.warning("push: register failed provider=%s status=%s body=%s",
                       provider.value, resp.status_code, resp.text[:300])
        return False
    except Exception as exc:  # noqa: BLE001 — best-effort
        logger.warning("push: register errored (swallowed): %r", exc)
        return False


async def unregister_device(
    *,
    tenant_id: str,
    user_id: str,
    provider: PushProvider = PushProvider.FCM,
) -> bool:
    """Remove a subscriber's credentials for one provider (logout / device revoke)."""
    if not settings.enabled:
        return False
    sub_id = build_subscriber_id(tenant_id, user_id)
    try:
        async with httpx.AsyncClient(timeout=settings.timeout_seconds) as client:
            resp = await client.delete(
                f"{settings.api_url}/v1/subscribers/{sub_id}/credentials/{provider.value}",
                headers={"Authorization": f"ApiKey {settings.secret_key}"},
            )
        return resp.status_code // 100 == 2
    except Exception as exc:  # noqa: BLE001
        logger.warning("push: unregister errored (swallowed): %r", exc)
        return False
