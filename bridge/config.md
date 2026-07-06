# Bridge wire-up — merging Novu into `notification-service`

This is the exact, minimal change to apply **after** the team approves. Nothing outside
`services/notification` changes; the ~40 producers and `shared/utils/notify.py` are untouched.

## 1. Files to copy

- `bridge/notification_service/novu_client.py`  →  `services/notification/app/services/novu_client.py`

`httpx` is already a backend dependency — no new requirements.

## 2. Environment (notification-service in `docker-compose.yml` + `.env.example`)

```yaml
      NOTIFY_ENGINE: ${NOTIFY_ENGINE:-legacy}          # legacy | dual | novu
      NOVU_API_URL: ${NOVU_API_URL:-http://host.docker.internal:3010}
      NOVU_SECRET_KEY: ${NOVU_SECRET_KEY:-}            # environment Secret Key from Novu dashboard
```

Run the POC with `NOTIFY_ENGINE=dual` so the legacy bell and Novu run side by side.

## 3. Patch `app/routes/notifications.py`

At the top, alongside the other imports:

```python
import os
from ..services.novu_client import novu_client
```

### 3a. In `create_notification`, right after the realtime `publish_to_user(...)` block

The DB insert + `result is None` suppression check already ran above, so a muted
recipient never reaches here — Novu inherits the suppression for free.

```python
    # ── Novu bridge (best-effort; never breaks the business action) ──
    if os.getenv("NOTIFY_ENGINE", "legacy") in ("dual", "novu") and result:
        await novu_client.trigger(
            tenant_id=user_context["tenant_id"],
            recipient_id=str(data.recipient_id),
            title=result.title,
            message=result.message,
            category=result.category,
            priority=getattr(result, "priority", "normal"),
            action_url=getattr(result, "action_url", None),
            tenant_subdomain=user_context.get("subdomain"),
            recipient_email=user_context.get("recipient_email"),  # see note below
            recipient_name=user_context.get("recipient_name"),
        )
```

> Recipient email/name: the trigger works without them (Novu still creates the subscriber),
> but the email step needs an address. Resolve it once via the existing
> `IdentityServiceClient.get_user(str(data.recipient_id))` (internal HMAC call,
> `shared/utils/service_client.py:381`) and cache it (TTL) — recommended as a small helper
> so both `create` and `bulk` share it. Kept out of the snippet to isolate the diff.

### 3b. In `send_bulk_notification`, inside the existing `for recipient_id in data.recipient_ids:` loop

```python
            if os.getenv("NOTIFY_ENGINE", "legacy") in ("dual", "novu"):
                await novu_client.trigger(
                    tenant_id=user_context["tenant_id"],
                    recipient_id=str(recipient_id),
                    title=data.title,
                    message=data.message,
                    category=data.category.value if hasattr(data.category, "value") else str(data.category),
                    priority="normal",
                    tenant_subdomain=user_context.get("subdomain"),
                )
```

## 4. GDPR erase cascade — `app/routes/dsr.py`

In the erase path, after the local notification rows are deleted, drop the Novu subscriber:

```python
    from ..services.novu_client import novu_client
    await novu_client.delete_subscriber(tenant_id=tenant_id, recipient_id=str(user_id))
```

## 5. Novu-side setup (dashboard, http://localhost:4000)

1. Create workflows: `hrms-generic`, `hrms-timesheet`, `hrms-task` (+ `hrms-approval` if used).
   Each: an **In-App** step (optional during POC — the SSE bell already covers in-app) and an
   **Email** step templated from `{{payload.title}}` / `{{payload.message}}` with a deep link
   `https://{{payload.tenant_subdomain}}.<BASE_DOMAIN>{{payload.action_url}}`.
2. Add an **SMTP** integration → host `novu-mailpit`, port `1025`, no auth (local POC).
3. For per-tenant SMTP, add one integration per tenant and register its identifier in
   `_TENANT_EMAIL_INTEGRATION` inside `novu_client.py` (prod: source from tenant settings).

## 6. Rollback

Set `NOTIFY_ENGINE=legacy` (or unset `NOVU_*`). The bridge is never called; zero behavioral change.
