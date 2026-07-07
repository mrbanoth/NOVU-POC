# Licensing — NotiFly (built on Novu)

**NotiFly** is our internal, white-labeled notification platform. Its engine is the
**self-hosted community edition of [Novu](https://github.com/novuhq/novu)**, which we use under
its licenses. This file records the boundary so everyone building on NotiFly stays compliant.

> Not legal advice. For product/commercial decisions, have counsel confirm.

## The two-license boundary (from Novu's own repo)

| Code | License | We may… |
|---|---|---|
| Everything **except** `enterprise/packages/` (engine, API, workflows, in-app, all providers, dashboard) | **MIT** (© 2019 Noti-fire Apps Ltd) | use, modify, rebrand, integrate, ship in our products — **free** |
| `enterprise/packages/` (SSO, RBAC, MFA, translations, AI agents, remove-branding, billing) | **Novu Proprietary** (EE-PACKAGES-LICENSE) | **not use/modify** without a written commercial license from Novu |

## Our rules (keep NotiFly compliant)

1. **Keep the MIT notice.** Retain `LICENSE-MIT` and the copyright header in any Novu source/images we
   redistribute or self-host. It is source-only — it is **not** shown to end users, costs nothing, and
   does not limit how we brand or use NotiFly.
2. **Never set `NOVU_ENTERPRISE=true`** and never import/build code from `enterprise/packages/`.
   If we ever need SSO / RBAC / translations / AI agents, we **buy** the enterprise license first.
3. **Don't claim authorship of the engine.** NotiFly is *our product*; the Novu engine underneath
   remains Novu's copyright (used under MIT). We brand the product, not the upstream code.
4. **Attribution lives in `NOTICE`** — third-party components and their licenses.

## What this means in practice

- ✅ We can white-label every surface users/operators see (bell, push, emails, admin console).
- ✅ We can modify the MIT code (e.g. raise `SYSTEM_LIMITS`) and build our own images.
- ✅ We can use NotiFly across internal products (HRMS, etc.) and, subject to counsel, commercially.
- ❌ We cannot strip the MIT copyright notice from the source.
- ❌ We cannot use the enterprise (`enterprise/packages/`) features without a paid license.

See **[docs/WHITE-LABEL-PLAN.md](docs/WHITE-LABEL-PLAN.md)** for the rebrand plan and
**[docs/NOTIFLY-CHECKLIST.md](docs/NOTIFLY-CHECKLIST.md)** for status.
