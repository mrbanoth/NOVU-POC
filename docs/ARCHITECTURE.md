# Architecture — HRMS × Novu notifications (enterprise reference)

This document is the technical reference for wiring self-hosted Novu into the multi-tenant
HRMS as the unified notification engine: **in-app (Inbox), email, and push**, isolated per
tenant, and structured so a future mobile app is purely additive.

---

## 1. Design principles

1. **Bridge, don't replace.** The existing `POST /api/v1/notifications` contract and the ~40
   producers stay unchanged. Only `notification-service` learns to talk to Novu, behind a flag.
2. **Best-effort side effects.** A notification never breaks a business action. Every Novu call
   is wrapped, timed out (≤3 s), and swallowed on error. Legacy bell keeps working in `dual` mode.
3. **Tenant isolation by construction.** Tenancy is encoded in the subscriber id and enforced
   cryptographically for the in-app feed (HMAC). No tenant can read another's notifications.
4. **Channel-agnostic recipients.** One subscriber carries in-app + email + N push tokens.
   Adding iOS/Android later means registering a token against the same subscriber — no redesign.
5. **Reproducible, not click-ops.** Integrations and workflows are provisioned by script/API so
   the setup is versioned and repeatable across environments.

---

## 2. Component topology

```
                          HRMS tenant (subdomain.rainertek.cloud)
   ┌───────────────────────────────────────────────────────────────────────────┐
   │  producers (work / timesheet / leave / forms / payroll / knowledge …)      │
   │        │  notify_user / notify_manager_of / notify_tenant_admins           │
   │        ▼                                                                    │
   │  notification-service  ── DB insert (per-tenant `notification` schema)      │
   │        │                └─ Redis pub/sub → realtime-service → SSE bell      │  (legacy, unchanged)
   │        │                                                                    │
   │        ├─ NovuClient.trigger()            ← workflow per category           │
   │        ├─ mint_inbox_session()  (HMAC)    ← in-app Inbox auth               │
   │        └─ register_device()               ← push token → subscriber         │
   └────────┼──────────────────────────────────────────────────────────────────┘
            │ internal network only (host.docker.internal:3010)
            ▼
   ┌───────────────────────── Novu self-hosted (single deployment) ─────────────┐
   │  api · worker · ws · dashboard        MongoDB · Redis        Mailpit (dev)  │
   │  channels:  In-App (Inbox)  ·  Email (SMTP)  ·  Push (FCM/APNS/Expo/webhook)│
   └───────────────────────────────────────────────────────────────────────────┘
            ▲
            │ browser talks DIRECTLY to Novu for the Inbox feed (Bearer widget token)
   ┌────────┴──────────┐
   │ HRMS frontend     │  <Inbox/> component initialised with {appId, subscriberId, subscriberHash}
   └───────────────────┘
```

---

## 3. Multi-tenancy model

Novu subscribers are a **flat namespace per environment**. Environments are capped at **10 per
organization** (`SYSTEM_LIMITS.ENVIRONMENTS`), so "one environment per tenant" does not scale.
The model is therefore:

| Layer | Choice |
|---|---|
| Novu deployment | **One**, for the whole platform |
| Novu environment | **One** production environment (a second "development" env is fine for staging) |
| Tenant boundary | Encoded in the subscriber id: **`subscriberId = "<tenant_id>:<identity_user_id>"`** |
| Isolation enforcement | HMAC-signed Inbox sessions (§5) + composite id on every trigger/credential call |

Properties of the composite id:
- **Deterministic** — no lookup table; any service can compute it.
- **PII-free** — UUIDs only, no email in the key.
- **Collision-proof across tenants** — the same person's email in two tenants yields two distinct
  subscribers (`t1:<uid>`, `t2:<uid>`) that never share a feed, preferences, or device tokens.

> Novu v3 **removed** the older "Tenants" API that existed in v0.x; the composite subscriber id is
> the current, supported way to model tenancy. Verified against the 3.17 source (no tenant module).

---

## 4. Channel matrix

| Channel | Novu step | Provider(s) in community build | HRMS today | POC delivers |
|---|---|---|---|---|
| **In-app** | In-App (Inbox) | Novu Inbox | SSE bell (kept) | Novu Inbox as an **additive** feed, HMAC-isolated |
| **Email** | Email | SMTP (→ Mailpit locally; per-tenant SMTP in prod) | only auth emails via Celery | **business-event email** (the big gap) + digest |
| **Push** | Push | **FCM** (web+Android), **APNS** (iOS), **Expo** (RN), OneSignal, Pushpad, **Push Webhook** (local) | none | web push via FCM; local pipeline via Push Webhook |
| SMS / Chat | SMS / Chat | Twilio, Slack, … | none | out of scope (available, not built) |

**In-app strategy:** the SSE bell already works, so the POC treats Novu Inbox as an *additional*
in-app surface rather than a rip-and-replace. Production can migrate the bell to the Inbox
component later (bigger frontend change, evaluated separately) — the backend is identical either way.

**Push strategy (future-mobile):** FCM covers web browsers **and** Android from one integration.
iOS native uses APNS; a React-Native/Expo app uses Expo Push. All three attach to the *same*
subscriber via the same `register_device()` path — so shipping a mobile app is additive, not a
re-architecture. The **Push Webhook** provider gives a fully local demo with no Firebase account.

---

## 5. In-app isolation — how the Inbox stays tenant-safe

The Inbox feed is read by the browser directly from Novu. Without protection, anyone could request
any `subscriberId`'s feed. Novu prevents this with **HMAC subscriber authentication**:

```
subscriberHash = HMAC_SHA256( environmentSecretKey, subscriberId )      # hex
```

Verified in source (`is-valid-hmac.ts` → `createHmac('sha256', key).update(subscriberId)`), enforced
in the Inbox session use case when the In-App integration has `credentials.hmac = true`.

Sequence:

```
1. HRMS user loads a page.  Frontend → GET /api/v1/notifications/inbox-session   (authenticated)
2. notification-service derives tenant_id + user_id FROM THE JWT (never client input),
   computes subscriberId = "<tenant>:<user>", signs subscriberHash with the secret key,
   returns { applicationIdentifier, subscriberId, subscriberHash }.   ← all non-secret
3. Frontend <Inbox/> → POST {NOVU}/v1/inbox/session with that trio → Novu verifies the HMAC
   and returns a short-lived subscriber Bearer token.
4. Frontend → GET {NOVU}/v1/inbox/notifications  (Bearer) → only THIS subscriber's feed.
```

Because the secret key lives only in `notification-service`, a browser can never mint a hash for a
`subscriberId` it wasn't given — it cannot pivot to another user or another tenant. The
`bridge/notification_service/novu_inbox.py` module implements steps 2 exactly; the runnable
`demo/` proves steps 1–4 across two tenants.

---

## 6. Workflows (category → workflow)

One Novu workflow per HRMS `NotificationCategory`, or a generic fallback. Each workflow contains the
channel steps (in-app / email / push) with templates bound to the trigger `payload`.

| HRMS category | Workflow id | Steps (POC) |
|---|---|---|
| `timesheet` | `hrms-timesheet` | in-app · email · (digest for reminders) |
| `task` | `hrms-task` | in-app · push |
| `approval` | `hrms-approval` | in-app · email |
| everything else | `hrms-generic` | in-app · email |

Trigger payload contract (produced by `NovuClient.trigger`):

```json
{
  "name": "hrms-timesheet",
  "to": { "subscriberId": "<tenant>:<user>", "email": "...", "firstName": "..." },
  "payload": {
    "title": "...", "message": "...", "category": "timesheet", "priority": "normal",
    "action_url": "/timesheets/week/2026-07-06",
    "tenant_id": "...", "tenant_subdomain": "acme",
    "channels": { "in_app": true, "email": true, "push": true }
  },
  "overrides": { "email": { "integrationIdentifier": "smtp-acme" } }   // per-tenant SMTP (optional)
}
```

Templates reference `{{payload.title}}`, `{{payload.message}}`, and build deep links as
`https://{{payload.tenant_subdomain}}.<BASE_DOMAIN>{{payload.action_url}}`.

---

## 7. Preferences

- **POC:** HRMS keeps enforcing `notification_preferences` (current behavior, fails open). The
  allowed channels are passed in `payload.channels`, and workflow steps are conditioned on them.
  Simplest, zero new sync surface.
- **Production option:** sync the HRMS preference row to Novu subscriber preferences on each prefs
  update, so users can also manage them from the Inbox. Additive; not required for the POC.

---

## 8. Data lifecycle & GDPR

- Recipient resolution (employee→user, tenant-admin fan-out) stays in HRMS, upstream of Novu.
- **Erasure:** the DSR erase cascade calls `DELETE /v1/subscribers/{tenant}:{user}` (see
  `novu_client.delete_subscriber`) so a user's Novu subscriber, feed, and device tokens are removed
  alongside the HRMS data.
- Retention: Novu message retention is configured per environment; align with the HRMS 90-day
  notification retention.

---

## 9. Failure modes

| Failure | Behavior |
|---|---|
| Novu API down / slow | trigger times out ≤3 s, error swallowed; business action succeeds; legacy bell delivers (dual) |
| Bad/absent secret key | bridge reports `enabled=false`; no calls attempted |
| Workflow missing | trigger returns non-2xx, logged; nothing else affected |
| HMAC mismatch | Inbox session 400; frontend shows empty feed; no data leak |
| Push token invalid | provider drops it at send; no impact on other channels |

---

## 10. Production rollout (post-approval)

1. Deploy the Novu stack via Coolify next to HRMS (decouple MongoDB/Redis to managed instances).
2. Run `scripts/seed` against prod to create integrations (SMTP per tenant, FCM/APNS) + workflows.
3. Set `NOTIFY_ENGINE=dual` in prod for one sprint; watch delivery + errors.
4. Per-category cutover to `novu`; optionally migrate the SSE bell to the Inbox component.
5. Wire per-tenant SMTP integration creation into the tenant provisioning Celery flow.
