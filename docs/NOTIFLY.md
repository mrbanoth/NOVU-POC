# NotiFly — internal notification platform

**NotiFly is our own white-labeled build of the (MIT-licensed) Novu engine + dashboard**, run once
and reused by every internal product (HRMS, QMS, ShopEasy, …). Each product gets its **own isolated
organization** (separate API keys, workflows, subscribers) on the **one shared engine** — so a
notification in HRMS can never leak into QMS.

> **Why we can do this:** the Novu engine, SDKs and dashboard are **MIT-licensed** — free to use,
> modify, self-host and rebrand for internal use. We only keep away from `enterprise/packages/`
> (proprietary). See **[LICENSING.md](../LICENSING.md)**.

---

## What runs (one stack, all products)

| Piece | Where | Rebranded? |
|---|---|---|
| **NotiFly dashboard** | http://localhost:4000 | ✅ yes — this is the Novu dashboard, rebranded live |
| Notification engine (API) | :3010 | internal — no UI branding |
| Real-time WebSocket | :3011 | internal |
| Worker / Mongo / Redis / Mailpit | internal | — |

The dashboard is where operators build workflows, manage integrations, and watch the activity feed —
now under the **NotiFly** name.

---

## How the dashboard rebrand works (non-destructive)

The dashboard ships as a **pre-built image**, so "Novu" is baked into the bundle. Rather than fork and
rebuild it, we front it with a tiny **nginx branding proxy** (`deploy/notifly/`) that rewrites the
page to NotiFly on the way out. **The Novu image is never modified** — pull a newer version and the
branding still applies.

```
browser → :4000  [novu-notifly nginx]  →  novu-dashboard (internal)
                 ├─ rewrites <title> → "NotiFly"
                 ├─ swaps the favicon → NotiFly
                 └─ injects notifly-brand.js, which at runtime:
                      • sets the logo to notifly-logo.svg
                      • renames visible "Novu" text → "NotiFly"
```

Files (all in `deploy/notifly/`):
- `notifly.conf` — nginx proxy + HTML rewrites
- `notifly-brand.js` — runtime logo/title/text rebrand
- `notifly-logo.svg`, `notifly-favicon.svg` — the NotiFly mark (edit these to change the look)

**To change the brand** (name, colour, logo): edit `notifly-brand.js` (`BRAND`), the two SVGs, then
`docker compose -f deploy/docker-compose.yml restart novu-notifly`. No rebuild.

> **Pixel-perfect option:** for a build with *zero* Novu strings anywhere (emails, meta tags, deep
> menus), fork `apps/dashboard` from the Novu source, change the brand assets, and build your own
> image to replace `ghcr.io/novuhq/novu/dashboard`. Heavier; the proxy covers the visible surface.

---

## Onboard a new internal product (1 command)

Each product = its own isolated organization. Provision one with:

```powershell
powershell -File scripts/new-product.ps1 -Product "QMS" -AdminEmail "qms-admin@yourco.local"
```

It creates the org + Dev/Prod environments + keys, enables **In-App HMAC** (tenant isolation), adds an
SMTP integration and a starter workflow, then prints the three values that product's backend uses:

```
NOVU_API_URL                = http://localhost:3010
NOVU_API_KEY                = <secret — server-side only>
NOVU_APPLICATION_IDENTIFIER = <public app id>
```

Point it at NotiFly Cloud instead of local by adding `-Api https://api.novu.co`.

---

## How a product integrates

1. **Backend** holds `NOVU_API_KEY`; calls `trigger(workflowId, subscriberId, payload)`.
2. **SubscriberId convention:** `"<tenant>:<user>"` (or just `"<user>"` if single-tenant) — PII-free,
   collision-proof, and the unit of isolation.
3. **Frontend** renders the bell/inbox with the **public app id** + an **HMAC subscriber hash** minted
   by the backend (so one user can't read another's inbox).
4. **Extra channels** (our own Web Push via VAPID, no Firebase) fan out from the same `notify()` call.

Reference implementation: the HRMS app in `hrms-web/` (`lib/novu.js`, `lib/notify.js`,
`lib/webpush.js`). Drop-in for a Python backend: `bridge/`.

---

## Product isolation (why it's safe to share one engine)

| Boundary | Mechanism |
|---|---|
| Product ↔ product | **separate organizations** → separate API keys; a key for HRMS cannot touch QMS |
| Tenant ↔ tenant (within a product) | composite `tenant:user` subscriberId + **In-App HMAC** |
| Operator access | dashboard login is **per-organization membership** — invite a person only to the products they run |

---

## Ops quick reference

```powershell
# start everything (engine + NotiFly dashboard)
cd deploy; docker compose --env-file .env up -d

# restart just the branding after editing notifly-brand.js / the SVGs
docker compose -f deploy/docker-compose.yml restart novu-notifly

# health
curl http://localhost:4000/            # NotiFly dashboard
curl http://localhost:3010/v1/health-check
```

See the completion checklist: **[NOTIFLY-CHECKLIST.md](NOTIFLY-CHECKLIST.md)**.
