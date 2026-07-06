# HRMS × Novu — Notification Proof of Concept

Self-hosted **Novu** as the unified delivery engine (in-app + email + push + digests) behind
the existing HRMS notification contract — **without touching the ~40 trigger sites** — proving
tenant isolation and fail-safe behavior so the team can approve it for the product.

> Full rationale, phase breakdown, and showcase script: **[docs/NOVU-POC-PLAN.md](docs/NOVU-POC-PLAN.md)**

## Why Novu (self-hosted)

Fits all four HRMS constraints at once, where the alternatives each fail one:
data stays on our infra (vs SaaS-only Knock/Courier/MagicBell), full workflow engine with
inbox + preferences + digests (vs library-only Apprise/ntfy), and a clean multi-tenant mapping
(composite subscriber IDs). See the plan doc for the comparison.

## Repository layout

```
NOVU-POC/
├── README.md
├── docs/
│   ├── NOVU-POC-PLAN.md          # the 5-phase plan + showcase script
│   ├── ARCHITECTURE.md           # topology, tenancy model, channel matrix, in-app isolation flow
│   ├── SECURITY.md               # HMAC isolation, secrets, threat model, pre-prod checklist
│   └── OPERATIONS.md             # run/scale/backup/upgrade, footprint, observability
├── deploy/
│   ├── docker-compose.yml        # tailored Novu stack (api/worker/ws/dashboard/mongo/redis) + Mailpit
│   ├── .env.example / .env       # env template (committed) / real secrets (gitignored)
├── bridge/                       # backend integration — drops into services/notification unchanged
│   ├── notification_service/
│   │   ├── settings.py           # env-driven config + channel toggles + NOTIFY_ENGINE gate
│   │   ├── novu_client.py        # workflow triggers + subscriber delete (best-effort)
│   │   ├── novu_inbox.py         # HMAC subscriber-session minting  ← in-app isolation
│   │   └── push_registration.py  # channel-agnostic device tokens (FCM/APNS/Expo/webhook)
│   ├── demo_trigger.py           # standalone two-tenant trigger demo
│   └── config.md                 # exact wire-up + patch for notification-service
├── demo/                         # runnable, self-contained proof (no HRMS needed)
│   ├── backend/app.py            # FastAPI stand-in for the 3 new notification-service endpoints
│   ├── inbox/index.html          # in-app Inbox, live, two-tenant isolation
│   └── push/index.html           # local push pipeline viewer
└── scripts/
    ├── gen-secrets.ps1           # regenerate deploy/.env with fresh secrets
    ├── bootstrap.ps1             # one-command auto-provision (org, keys, HMAC, integrations, workflows)
    └── smoke-test.ps1            # health + HMAC parity + live trigger round-trip
```

## Phase 0 — Run Novu locally

Prereq: Docker Desktop.

```powershell
cd deploy
# .env already has working local secrets. To regenerate: ..\scripts\gen-secrets.ps1
docker compose --env-file .env up -d
```

| Service        | URL / Port                       | Purpose                                  |
|----------------|----------------------------------|------------------------------------------|
| Dashboard      | http://localhost:4000            | Create org, workflows, integrations      |
| API            | http://localhost:3010            | Trigger endpoint + health check          |
| WebSocket      | ws://localhost:3011              | Dashboard live updates                   |
| Mailpit UI     | http://localhost:8025            | View demo emails                         |
| Mailpit SMTP   | novu-mailpit:1025 (in-network)   | Novu email step target                   |
| MongoDB/Redis  | internal only (not published)    | Novu data + queues                       |

Ports are deliberately off Novu's defaults (API 3000→**3010**, WS 3002→**3011**) so they don't
collide with the HRMS Next.js frontend on :3000. All container names are `novu-*` prefixed so
they don't clash with the HRMS stack's own `redis`/`mongodb` containers.

**Verify:**
```powershell
docker compose ps
curl http://localhost:3010/v1/health-check      # -> {"status":"ok"}
```
Then open http://localhost:4000, create the admin account + organization, and copy the
environment **Secret Key** (Settings → API Keys) — Phase 1 needs it.

> Windows note: do **not** run the upstream `setup.sh` — it risks CRLF issues. The `.env` here
> is hand-authored and ready to use.

## How HRMS reaches Novu

The HRMS `notification-service` (in its own compose network) calls the Novu API at
`http://host.docker.internal:3010` — the same `host.docker.internal` pattern HRMS already uses
for `FRONTEND_URL`. The bridge is a small best-effort client added to notification-service behind a
`NOTIFY_ENGINE=legacy|dual|novu` flag; nothing else in HRMS changes.

## Quickstart (3 commands)

```powershell
cd deploy; docker compose --env-file .env up -d          # 1. start Novu
cd ..;     powershell -File scripts/configure.ps1        # 2. provision your org (HMAC, SMTP, workflows)
cd demo/backend; pip install -r requirements.txt; uvicorn app:app --host 0.0.0.0 --port 4200   # 3. demo
```

Open **http://localhost:4200** — an HRMS notification app with **3 roles** (Superadmin, Tenant
Admin, Employee), a **🔔 bell**, and a **live socket status light (green/red)**. Sign in as an
Employee, submit a timesheet → the Tenant Admin's bell lights up in real time with a Chrome
notification. Emails land in **Mailpit** (http://localhost:8025). Cross-tenant = isolated.
Full walkthrough: **[docs/TESTING.md](docs/TESTING.md)**. Real background push: **[docs/PUSH-FCM.md](docs/PUSH-FCM.md)**.

Provisioning: `scripts/configure.ps1` sets up an **existing** org from its Secret Key (reads
`deploy/.env`); `scripts/bootstrap.ps1` creates + provisions a **brand-new** org headlessly.
Both idempotent. Reuse in another project: **[docs/REUSE.md](docs/REUSE.md)**.

## Status — verified working end-to-end

- [x] **Novu stack** — 7/7 containers healthy on Docker 29.4.3.
- [x] **3-role HRMS model** — Superadmin / Tenant Admin / Employee across 2 tenants; role-based
      actions; fan-out verified (employee→admin, admin→employee, superadmin→all admins).
- [x] **In-app bell** — HMAC-isolated; cross-tenant leakage impossible (verified); forged HMAC → 400.
- [x] **Real-time socket** — live `notification_received` over Novu WS verified with a real
      socket.io client; green/red status light; instant bell + native Chrome notification.
- [x] **Email** — business-event emails land in Mailpit (the gap HRMS has today).
- [x] **Push** — Tier 1 foreground Chrome notifications working now; Tier 2 background via FCM (guide).
- [x] **Resilience** — best-effort bridge; Novu down ⇒ caller still succeeds.

Read next: **[docs/TESTING.md](docs/TESTING.md)** (manual tests) · **[docs/PUSH-FCM.md](docs/PUSH-FCM.md)**
(real background push) · **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** · **[docs/SECURITY.md](docs/SECURITY.md)** · **[docs/REUSE.md](docs/REUSE.md)**.

Reference (read-only): the upstream Novu clone lives at `..\Novu\novu` and is used only to
source the official compose file and read code — it is never built from source.
