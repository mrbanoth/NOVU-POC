# NotiFly — white-label completion checklist

Turning the self-hosted Novu engine + dashboard into **NotiFly**, our reusable internal notification
platform. `[x]` done · `[~]` done via proxy (good enough for internal use) · `[ ]` optional / later.

---

## Phase 1 — Licensing & compliance foundation
- [x] Confirm the engine, SDKs and dashboard are **MIT** (free to self-host, modify, rebrand)
- [x] Keep clear of `enterprise/packages/` (proprietary) — we use none of it; never `NOVU_ENTERPRISE=true`
- [x] `LICENSING.md` — what we may rebrand and the one rule we keep (retain the MIT notice in source)
- [x] `NOTICE` — attribution kept per the MIT terms
- [ ] Fill your company name in `NOTICE`
- [x] No Novu **trademark** use in outward/customer-facing material (internal use is fine)

## Phase 2 — End-user surface (in product apps)
- [x] In-app bell / inbox (real-time socket) — HRMS reference app
- [x] Email channel (SMTP → Mailpit locally)
- [x] Our own **Web Push (VAPID, no Firebase)** — works with the tab closed
- [x] One `notify()` fan-out so product code never sees the channel split
- [x] Tenant isolation via `tenant:user` subscriberId + In-App HMAC

## Phase 3 — Operator console (the dashboard) → **NotiFly**
- [~] **The actual Novu dashboard at `:4000` is rebranded to NotiFly** via the nginx branding proxy
  - [x] `<title>` → NotiFly · [x] favicon → NotiFly · [x] logo swap · [x] "Novu"→"NotiFly" text
  - [x] External Novu doc/marketing links stripped + leftover "Powered by" blocks hidden (brand.js)
  - [x] Non-destructive (Novu image untouched; survives image upgrades)
  - [x] Superseded the separate `notifly-console` idea — we changed the real dashboard, not a clone
  - [ ] *(optional)* fork + rebuild `apps/dashboard` for a zero-Novu-string build

## Phase 4 — Branded emails / inbox
- [x] **"Powered by Novu" watermark removed** from all emails, the in-app inbox, and editor previews
  (`removeNovuBranding=true` on every org via `scripts/white-label.ps1`) — **verified clean in Mailpit**
- [x] Sender name / from-address per product (set by `new-product.ps1`; e.g. `hrms@localhost`, not `novu.co`)
- [ ] *(optional)* custom brand logo/color in emails via the org Branding settings

## Phase 5 — Infrastructure (run once, reuse)
- [x] Single self-hosted stack (api + worker + ws + dashboard + mongo + redis + mailpit)
- [x] NotiFly branding proxy added to `deploy/docker-compose.yml` (`novu-notifly`)
- [x] Pinned image versions; JSON-file logging caps
- [x] Secrets only in git-ignored `.env`; `.env.example` committed
- [x] CI guard fails the build if a secret/real env file is ever tracked

## Phase 6 — Reusable onboarding + SDK
- [x] `scripts/new-product.ps1` — one command provisions a fully isolated product org + keys
- [x] Integration convention documented (`docs/NOTIFLY.md`)
- [x] Reference integrations: `hrms-web/` (Next.js) and `bridge/` (Python drop-in)
- [ ] *(optional)* publish a thin internal npm/pip wrapper so products import one client

## Phase 7 — Limits
- [x] Self-hosted **community** edition — no per-message billing, no seat caps for internal use
- [x] Operator access scoped by **organization membership** (invite per product)
- [ ] *(note)* enterprise-only features (advanced RBAC, translations, tiered limits) stay off — licensed

## Phase 8 — Ship & integrate
- [x] `docs/NOTIFLY.md` — what it is, how to onboard, how to integrate, how to re-skin
- [x] This checklist
- [ ] Onboard the **first real product** (e.g. QMS) with `new-product.ps1` and wire its backend
- [ ] Decide hosting for the shared engine (internal VM vs NotiFly Cloud) for the team demo

---

### What's live right now
- **NotiFly dashboard:** http://localhost:4000 (hard-refresh: `Ctrl+Shift+R`)
- **Engine:** http://localhost:3010 · **Mailpit:** http://localhost:8025
- **HRMS reference app:** http://localhost:3005
