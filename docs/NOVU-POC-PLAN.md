# Novu Notification POC — Implementation Plan

> **Goal:** Prove that self-hosted Novu can become the unified delivery engine (in-app + email +
> push + digests) behind the existing HRMS notification contract — **without changing any of the
> ~40 trigger sites** — and demonstrate tenant isolation, so the team can approve it for the product.
>
> **Working constraint:** All POC artifacts live in **this repo** (`NOVU-POC`). The HRMS backend
> integration is delivered here as **ready-to-apply reference code + a diff + instructions**, and a
> **standalone demo trigger** proves the Novu side end-to-end without modifying the HRMS repo. The
> actual edits land in `hrms-saas-backend` only after the team approves.

---

## Why Novu self-hosted (verdict)

| Option | Verdict |
|---|---|
| **Novu self-hosted (MIT community)** ✅ | Data stays on our infra; workflow engine with inbox + preferences + digests; clean multi-tenant mapping; Docker deploy alongside self-hosted Logto/MinIO |
| Knock / Courier / MagicBell / SuprSend | SaaS-only → tenant data leaves our infra, breaks the isolation stance |
| Apprise / ntfy / Gotify | Delivery library / push-only → no inbox, no preferences, no workflows |
| Extend in-house | Rebuilds digest engine, provider abstraction, template mgmt by hand — more work, less capability |

Verified against the cloned Novu monorepo (commit `da35e90`, 2026-07-05; self-host images `3.17.0`,
now at `..\Novu\novu`, used read-only).

---

## Architecture (bridge, don't replace)

```
  task / timesheet / leave / forms ... services        (UNCHANGED)
        │  notify_user(...) helpers                    (UNCHANGED)
        ▼
  POST /api/v1/notifications  (internal, HMAC)         (UNCHANGED contract)
        │
        ▼
  notification-service
        ├── 1. preference check + DB insert            (UNCHANGED — bell keeps working)
        ├── 2. Redis publish → SSE bell                (UNCHANGED)
        └── 3. NEW: if NOTIFY_ENGINE in (dual, novu):
                 NovuClient.trigger(workflow, to, payload)   ← best-effort, errors swallowed
                        │
                        ▼
              Novu (self-hosted: api + worker + ws + MongoDB + Redis)
                        ├── email step  → SMTP (Mailpit locally / tenant SMTP in prod)
                        ├── push step   → FCM (web push)
                        └── digest step → batched reminder emails
```

**Feature flag:** `NOTIFY_ENGINE=legacy | dual | novu`
- `legacy` — today's behavior, Novu never called (instant rollback).
- `dual` — POC mode: legacy bell **and** Novu triggers run side by side.
- `novu` — post-approval full cutover (not used during the POC).

### Multi-tenancy mapping (verified against Novu 3.17 source)

| Concern | Decision | Why |
|---|---|---|
| Tenant encoding | `subscriberId = "<tenant_id>:<identity_user_id>"` | Novu v3 **removed** the Tenants API; composite ID is deterministic and collision-proof (same email in 2 tenants → 2 subscribers) |
| Deployment topology | **One** Novu deployment, **one** environment for the whole platform | Environments are hard-capped at 10/org (`SYSTEM_LIMITS.ENVIRONMENTS`) — env-per-tenant does not scale |
| Per-tenant SMTP | One SMTP integration per tenant (`smtp-<subdomain>`), selected at trigger via `overrides.email.integrationIdentifier` | Override still exists in v3 trigger API |
| Recipient identity | Identity `user_id` only (employee→user resolution stays in HRMS, upstream of the bridge) | Same boundary as today |
| Preferences | Enforced HRMS-side (existing behavior); channel flags passed in trigger payload | Simplest for POC; Novu-side preference sync is a production follow-up |

---

## Phase 0 — Stand up Novu self-hosted ✅ (done)

Artifacts: `deploy/docker-compose.yml`, `deploy/.env(.example)`, `scripts/gen-secrets.ps1`.

- Community images `3.17.0` (never build the monorepo). Ports API **3010** / WS **3011** / dashboard
  **4000** (off Novu defaults to avoid the HRMS frontend on :3000). Containers `novu-*` prefixed;
  redis/mongodb unpublished. **Mailpit** added (SMTP :1025, UI :8025) to view demo emails.
- Run: `cd deploy && docker compose --env-file .env up -d` → dashboard at :4000 → create org/admin →
  copy environment Secret Key.

**Exit criteria:** dashboard reachable, `GET :3010/v1/health-check` ok, Mailpit up.

---

## Phase 1 — Bridge (delivered as ready-to-apply reference code here)

Lives in `bridge/` in this repo:

1. **`bridge/notification_service/novu_client.py`** — drop-in async client for notification-service:
   - `async trigger(workflow_id, subscriber, payload, overrides=None)` →
     `POST {NOVU_API_URL}/v1/events/trigger`, header `Authorization: ApiKey {NOVU_SECRET_KEY}`,
     httpx timeout ≤ 3 s, **all exceptions caught + logged** (preserves "notifications are side effects").
   - Builds `subscriberId = f"{tenant_id}:{recipient_id}"`; Novu upserts subscribers lazily on trigger.
   - Category → workflow map: `timesheet → hrms-timesheet`, `task → hrms-task`, else `hrms-generic`.
2. **`bridge/notifications.py.patch`** — the exact insertion into
   `services/notification/app/routes/notifications.py` (after the DB insert + `result is None`
   suppression check, in both `create_notification` and `send_bulk_notification`).
3. **`bridge/config.md`** — the env additions for notification-service:
   `NOTIFY_ENGINE=dual`, `NOVU_API_URL=http://host.docker.internal:3010`, `NOVU_SECRET_KEY=…`.
4. **`bridge/demo_trigger.py`** — standalone script that simulates a notification-service call
   (composite subscriberId + payload) so the whole Novu path is demoable **without** touching HRMS.

Recipient email/name for the subscriber object comes from the existing
`IdentityServiceClient.get_user(user_id)` internal call (add a small TTL cache) — documented in
`bridge/config.md`, applied when the code is merged into HRMS.

**Exit criteria:** `demo_trigger.py` fires `hrms-generic` → appears in the Novu activity feed with the
composite subscriberId; the patch is reviewed and ready to apply.

---

## Phase 2 — Email leg for business events — *closes the biggest product gap*

Business events currently have **no email at all** (only auth emails via Celery SMTP). Headline demo.

1. SMTP integration in Novu → Mailpit (`novu-mailpit:1025`).
2. Workflow **`hrms-timesheet`**: email step templated with `{{payload.title}}` / `{{payload.message}}`,
   deep link `https://{{payload.tenant_subdomain}}.<BASE_DOMAIN>{{payload.action_url}}`.
3. Workflow **`hrms-timesheet-reminder`** with a **digest step** (short window for the demo): N reminders
   collapse into one email — a capability the current system has no equivalent of.
4. **Per-tenant SMTP demo:** second integration (`smtp-<tenant2>`) selected via
   `overrides.email.integrationIdentifier`. *Production:* auto-create it during tenant provisioning from
   the existing encrypted per-tenant SMTP settings.

Workflow definitions exported to `workflows/` (JSON) so they're reproducible, not just dashboard state.

**Exit criteria:** timesheet-submit demo → email in Mailpit; digest demo works; two tenants → two SMTP integrations.

---

## Phase 3 — Push channel (web push via FCM)

1. Firebase project → service account JSON → **FCM integration** in Novu.
2. Frontend reference (in `frontend-snippets/`): `firebase-messaging-sw.js` service worker + an opt-in
   button that obtains the FCM token and POSTs it to a new notification-service endpoint.
3. Backend reference: endpoint that forwards the token to Novu
   `PUT /v1/subscribers/{tenant_id}:{user_id}/credentials` (providerId `fcm`).
4. Push step added to `hrms-task`.

**Exit criteria:** task-assign demo → browser push arrives with the tab closed.

---

## Phase 4 — Isolation proof, resilience & DSR

| # | Test | Pass condition |
|---|---|---|
| 1 | Two tenants, **same email**, notify both | Two distinct subscribers (`t1:<uid>` / `t2:<uid>`), zero crossover in feeds |
| 2 | Stop all Novu containers, then submit a timesheet | Business action succeeds, legacy bell delivers, only a warning logged |
| 3 | Recipient turns `email_enabled` off | In-app delivered; no email leg |
| 4 | Digest window with 5 reminders | 1 summary email |
| 5 | GDPR erase | `DELETE /v1/subscribers/{tid}:{uid}` added to the erase cascade (`dsr.py`); subscriber gone |

Delivered here as `tests/` scripts + a findings checklist.

---

## Showcase script (team / sir)

1. **Gap today:** submit timesheet → bell only, no email, no push.
2. Flag `NOTIFY_ENGINE=dual` → same action → bell **+ email in Mailpit** (+ push on task assign).
3. **Digest:** 5 reminders → 1 email.
4. **Isolation:** same email in two tenants → two subscribers in the dashboard, no leakage.
5. **Safety:** stop Novu → product keeps working; flip flag to `legacy` → zero footprint.
6. Findings doc: ops cost, per-tenant SMTP strategy, production rollout path.

## Production rollout path (post-approval)

Deploy the Novu stack via Coolify next to HRMS → provision workflows per category → wire per-tenant
SMTP integration creation into tenant provisioning → run `dual` in production for a sprint → per-category
cutover; bell→Novu-Inbox migration evaluated separately (bigger frontend change, not required).

## Scope exclusions (POC)

Replacing the SSE bell with Novu's `<Inbox />` component; SMS; native mobile push (APNs); Novu-side
preference sync; translations (enterprise-gated).

## Effort & footprint

- ~5–6 working days total (Phases 0–4 + showcase prep).
- Added infra: MongoDB 8 + Redis + 4 Node services ≈ 1.5–2.5 GB RAM; images pinned `3.17.0`.
- Licensing: MIT community edition; enterprise features not needed for this scope.

*Verified against Novu monorepo @ `da35e90` (images 3.17.0) and the HRMS `dev` codebase.*
