# NotiFly — White-label plan (end-to-end)

**NotiFly** = our internal, reusable notification platform. Engine = self-hosted **Novu (MIT
community edition)**; every surface users/operators see is **ours**. See [LICENSING.md](../LICENSING.md).

## The shape of the product

```
                 NotiFly (our product)
  ┌─────────────────────────────────────────────────────────┐
  │  NotiFly Console (our branded admin)   ← notifly-console │
  │  NotiFly SDK (backend + frontend)      ← bridge/ + hrms  │
  │  NotiFly onboarding (org per product)  ← new-product.ps1 │
  └───────────────┬─────────────────────────────────────────┘
                  │  (headless)
        Novu engine (MIT) — api · worker · ws · mongo · redis
                  │
   consumed by →  HRMS · (future products) …  each = its own isolated Novu org
```

## Phases

| # | Phase | Deliverable | Status |
|---|---|---|---|
| 0 | Foundation & compliance | LICENSING.md · NOTICE · this plan · checklist | ✅ done |
| 1 | End-user surface | custom bell + inbox + Web Push (no Novu branding) | ✅ done (hrms-web) |
| 2 | Operator console | **NotiFly Console** — branded admin on Novu's API | ✅ scaffolded (`notifly-console/`) |
| 3 | Emails & channels | NotiFly email layout + from-domain | ◻ config (documented) |
| 4 | Infra white-label | your domain, renamed containers, HTTPS | ◻ your infra |
| 5 | Reusable SDK + onboarding | `new-product.ps1` + branded SDK | ✅ onboarding script; SDK = bridge/ |
| 6 | Limits (optional) | fork MIT + raise `SYSTEM_LIMITS` + build images | ◻ only if needed |
| 7 | Ship & integrate | prod deploy + integrate per product | ◻ your infra |

## Phase details

**Phase 2 — NotiFly Console** (`notifly-console/`, Next.js, port 3006)
Branded operator UI that reads Novu's management API (via the product's API key), server-proxied so
no key touches the browser. Screens: Overview (counts + recent activity), Workflows, Subscribers,
Activity feed, Settings. No Novu branding anywhere. Run: `cd notifly-console; npm install; npm run dev`.

**Phase 3 — Emails**
In the Novu dashboard (or via API), set an **Email Layout** with the NotiFly logo/header/footer and an
SMTP integration whose `from` is your domain → all business emails look like NotiFly.

**Phase 4 — Infra**
Put the API + console behind `notify.yourco.com` (reverse proxy + HTTPS). Optionally rename the
`novu-*` containers to `notifly-*`. Decouple Mongo/Redis to managed instances for prod.

**Phase 5 — Reusable onboarding & SDK**
`scripts/new-product.ps1 -Product "<name>" -AdminEmail <email>` provisions a fully isolated Novu org
(Dev/Prod, keys, HMAC, default workflows, integrations) for a new internal product in one command.
The integration SDK is `bridge/` (drop-in for any backend) + the frontend bell/push in `hrms-web`.

**Phase 6 — Limits (only if you hit them)**
`SYSTEM_LIMITS` (100 workflows/env, 10 envs/org) live in MIT code — fork, edit, build your own images.

**Phase 7 — Ship**
Deploy the stack (Coolify/K8s), point each product's backend at NotiFly via the SDK, one org per product.

## Reuse in a new internal product (the whole point)

1. `scripts/new-product.ps1 -Product "CRM"` → get CRM's isolated org + keys.
2. Drop the **NotiFly SDK** (`bridge/`) into CRM's backend; use `notify(...)`.
3. Add the **bell + Web Push** frontend package to CRM's UI.
4. CRM's ops team uses the **NotiFly Console** for CRM's org.
Everything isolated; ~half a day to onboard a product.
