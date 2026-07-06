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
    ├── seed.ps1                  # provision workflows + fetch app identifier (idempotent)
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

## Run the enterprise demo (in-app + push, tenant-isolated)

After Phase 0 is up:

1. Open http://localhost:4000 → create admin + org → **Settings → API Keys**.
2. Put the **Secret Key** in `deploy/.env` as `NOVU_SECRET_KEY=…`, then:
   ```powershell
   powershell -File scripts/seed.ps1        # writes NOVU_APPLICATION_IDENTIFIER, creates workflows
   ```
   Finish the 3 dashboard integration steps it prints (SMTP→Mailpit, Push Webhook, **enable In-App HMAC**).
3. Start the demo backend + pages:
   ```powershell
   cd demo/backend; pip install -r requirements.txt
   uvicorn app:app --host 127.0.0.1 --port 4200
   ```
4. Open http://localhost:4200 → switch tenant **acme ↔ globex** with the *same* user id →
   two isolated feeds. Send a test → email lands in Mailpit. Push pipeline at http://localhost:4200/push.
5. `powershell -File scripts/smoke-test.ps1` for an automated health + trigger check.

## Status

- [x] **Phase 0** — self-hosted Novu stack + Mailpit — **verified up on Docker 29.4.3** (7/7 healthy,
      `:3010/v1/health-check` all `up`, dashboard + Mailpit 200).
- [x] **Phase 1** — bridge (`settings`, `novu_client`, `novu_inbox`, `push_registration`);
      **HMAC verified byte-identical to Novu's algorithm** (Python == PowerShell == Novu source).
- [x] **In-app (Inbox)** — HMAC-isolated session minting + runnable two-tenant demo.
- [x] **Push** — channel-agnostic registration (FCM/APNS/Expo/webhook) + local pipeline demo.
- [ ] Phase 2 — email templates + digest + per-tenant SMTP (needs dashboard workflows).
- [ ] Phase 4 — record the isolation / resilience / DSR proofs.

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** and **[docs/SECURITY.md](docs/SECURITY.md)** for the
enterprise design and isolation guarantees.

Reference (read-only): the upstream Novu clone lives at `..\Novu\novu` and is used only to
source the official compose file and read code — it is never built from source.
