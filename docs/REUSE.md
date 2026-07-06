# Reuse Guide - drop this notification solution into another project

This POC is built as a **portable notification solution**, not a one-off. The Novu stack, the bridge,
and the demo are decoupled from HRMS specifics. Reusing it in another product is mostly a config change.

---

## What's reusable as-is (project-agnostic)

| Piece | Reusable? | Notes |
|---|---|---|
| `deploy/` (compose + env + secrets) | 100% | Any project. Change ports if they clash with the new app. |
| `scripts/bootstrap.ps1` | 100% | One `CONFIG` block at the top - change org name / admin / workflows. |
| `scripts/gen-secrets.ps1`, `smoke-test.ps1` | 100% | No project coupling. |
| `bridge/notification_service/` | ~95% | Pure `httpx` + stdlib. Only the subscriber-id scheme and category->workflow map are opinionated (both are one function each). |
| `demo/` | 100% | Generic Inbox + push demo; rename labels only. |
| `docs/` | template | Architecture/security/testing carry over; swap the product name. |

The bridge has **no HRMS imports** by design - it depends only on `httpx` and the standard library, so
it drops into any Python service (FastAPI/Flask/Django). For a Node/Go/other backend, the same 4 REST
calls apply (`/v1/events/trigger`, `/v1/inbox/session` HMAC, `/v1/subscribers/:id/credentials`,
`/v1/subscribers/:id`) - port the ~120 lines of `novu_client.py` + `novu_inbox.py`.

---

## The only 3 things a new project must decide

1. **Subscriber-id scheme** - how you encode identity (and tenancy, if multi-tenant).
   - Multi-tenant: `"<tenant_id>:<user_id>"` (this POC).
   - Single-tenant: just `"<user_id>"`.
   - Edit one function: `build_subscriber_id()` in `novu_client.py`.

2. **Categories -> workflows** - your notification types and which channels each uses.
   - Edit `_CATEGORY_WORKFLOW` in `novu_client.py` and the `$Workflows` list in `bootstrap.ps1`.

3. **Channels + providers** - which of in-app / email / push / SMS / chat you want, and the provider
   for each (SMTP vs SendGrid; Push Webhook vs FCM/APNS/Expo). Set them in `bootstrap.ps1` integrations.

Everything else - HMAC isolation, best-effort semantics, the demo, health checks - carries over unchanged.

---

## Step-by-step: reuse in "ProjectX"

```
1. Copy these folders into ProjectX:   deploy/  bridge/  scripts/  demo/  docs/
2. deploy/.env         -> change ports if 3010/4000/4200 clash; regenerate secrets (gen-secrets.ps1)
3. scripts/bootstrap.ps1 CONFIG block:
      $OrgName        = 'ProjectX'
      $AdminEmail     = 'admin@projectx.local'
      $Workflows      = @( ... your categories ... )
4. bridge/notification_service/novu_client.py:
      build_subscriber_id()   -> your identity scheme
      _CATEGORY_WORKFLOW      -> your categories
5. docker compose up -d ; powershell scripts/bootstrap.ps1
6. Wire the 3 endpoints into ProjectX's backend (see bridge/config.md) behind NOTIFY_ENGINE.
7. Verify with docs/TESTING.md.
```

Time to a working notification stack in a new project: ~30 minutes, most of it deciding workflows.

---

## Integrating the bridge into a backend (any project)

The bridge exposes 4 operations your app calls:

| Operation | When your app calls it | Bridge function |
|---|---|---|
| Send a notification | on a business event (task assigned, order shipped, ...) | `novu_client.trigger(...)` |
| Open the in-app feed | on page load, for the logged-in user | `mint_inbox_session(...)` -> give trio to `<Inbox/>` |
| Register a push device | when the client obtains an FCM/APNS/Expo token | `register_device(...)` |
| Forget a user (GDPR) | on account deletion | `novu_client.delete_subscriber(...)` |

All are best-effort and never raise. Keep them behind a `NOTIFY_ENGINE` flag so the platform can be
turned off/rolled back instantly. See `bridge/config.md` for exact route code.

---

## Production hardening checklist (any project)

- Decouple MongoDB + Redis to managed instances (don't co-locate in prod).
- Put the environment Secret Key in the platform secret store; never in the frontend bundle.
- Enable HMAC on the In-App integration (bootstrap does this) for every shared environment.
- Restrict `FRONT_BASE_URL` to real origins; keep the Novu API on an internal network.
- Point email at a real provider; push at FCM/APNS/Expo instead of the local webhook.
- See `docs/SECURITY.md` for the full pre-production checklist and `docs/OPERATIONS.md` for scaling/backup.
