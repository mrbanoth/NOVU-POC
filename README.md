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
│   └── NOVU-POC-PLAN.md          # the plan (5 phases, showcase script, acceptance tests)
├── deploy/
│   ├── docker-compose.yml        # tailored Novu stack (api/worker/ws/dashboard/mongo/redis) + Mailpit
│   ├── .env.example              # env template (committed)
│   └── .env                      # real secrets (gitignored)
└── scripts/
    └── gen-secrets.ps1           # regenerate deploy/.env with fresh secrets
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
for `FRONTEND_URL`. The bridge (Phase 1) is a small best-effort client added to
notification-service behind a `NOTIFY_ENGINE=legacy|dual|novu` flag; nothing else in HRMS changes.

## Status

- [x] **Phase 0** — self-hosted Novu stack + Mailpit, tailored ports/names, secrets, run docs
- [ ] Phase 1 — bridge client in notification-service (`NOTIFY_ENGINE` flag)
- [ ] Phase 2 — email leg for business events + digest + per-tenant SMTP
- [ ] Phase 3 — web push (FCM)
- [ ] Phase 4 — isolation / resilience / DSR proofs

Reference (read-only): the upstream Novu clone lives at `..\Novu\novu` and is used only to
source the official compose file and read code — it is never built from source.
