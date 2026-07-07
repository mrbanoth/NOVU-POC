# Deploy the POC to Vercel (shareable link for the team / sir)

The Next.js app (`hrms-web/`) deploys to Vercel. Because Vercel is serverless, two things that
run locally must move to the cloud (both have free tiers):

| Piece | Local | Cloud (for Vercel) |
|---|---|---|
| App UI + API | `npm run dev` | **Vercel** |
| Data + push subscriptions | JSON file (`data/`) | **Upstash Redis** (Vercel's FS is read-only) |
| Notification engine (Novu) | self-hosted `localhost` | **Novu Cloud** (free) — Vercel can't reach your laptop |

The code already handles this: the store uses Upstash automatically when `UPSTASH_REDIS_REST_URL`
is set (falls back to files locally). You just create three free accounts and set env vars.

---

## Step 1 - Novu Cloud (the notification engine)

1. Sign up at **https://dashboard.novu.co** (free). Create an organization.
2. **Settings → API Keys**: copy the **Application Identifier** and the **Secret Key**.
3. Provision the workflows + Inbox HMAC against Cloud (from your machine):
   ```powershell
   # put the Cloud Secret Key + App Identifier in deploy/.env (NOVU_API_KEY / NOVU_APPLICATION_IDENTIFIER)
   powershell -File scripts/configure.ps1 -Api https://api.novu.co
   ```
   (SMTP→Mailpit is local-only and will fail on Cloud — ignore it; the in-app bell is what matters.
   For real email on Cloud, add an email provider in the Novu dashboard.)
4. Cloud URLs for the env vars below: API `https://api.novu.co`, WebSocket `https://ws.novu.co`.

> Prefer fully self-hosted? Deploy the `deploy/` Novu stack to a public server (Railway / Render /
> a VPS with a domain) and use those URLs instead of the Cloud ones. Everything else is identical.

## Step 2 - Upstash Redis (the data store)

Easiest: in the Vercel project (Step 3) → **Storage → Marketplace → Upstash → Redis → Create**;
Vercel injects the env vars automatically. Or manually at **https://upstash.com** (free): create a
Redis database, copy its **REST URL** and **REST TOKEN**.

## Step 3 - Vercel (the app)

1. Sign in at **https://vercel.com** with GitHub → **Add New… → Project** → import
   **`mrbanoth/NOVU-POC`**.
2. **Root Directory: `hrms-web`** (important — the app lives in that subfolder). Framework: Next.js
   (auto-detected). Build/Output: defaults.
3. **Environment Variables** — add these (Settings → Environment Variables):

   ```
   NOVU_API_URL                 = https://api.novu.co
   NOVU_WS_URL                  = https://ws.novu.co
   NOVU_API_KEY                 = <Novu Cloud Secret Key>
   NOVU_APPLICATION_IDENTIFIER  = <Novu Cloud Application Identifier>
   VAPID_PUBLIC_KEY             = <same as your hrms-web/.env.local>
   VAPID_PRIVATE_KEY            = <same as your hrms-web/.env.local>
   VAPID_SUBJECT                = mailto:you@company.com
   UPSTASH_REDIS_REST_URL       = <from Upstash>   (or auto-set by the Vercel integration)
   UPSTASH_REDIS_REST_TOKEN     = <from Upstash>
   ```
   (Generate VAPID keys once with `node -e "console.log(require('web-push').generateVAPIDKeys())"`.)
4. **Deploy.** You get a production URL like `https://novu-poc.vercel.app`.

---

## Links you can share

- **Production:** `https://<project>.vercel.app` — send this to sir / the team.
- **Development / preview links:** Vercel auto-builds a **unique preview URL for every branch and
  pull request** (Deployments tab). Push a branch → get a fresh link to review before it hits prod.

## Notes

- **HTTPS is automatic** on Vercel, so Web Push works in production (localhost was the dev exception).
- Sample logins are the same: superadmin `admin@hrms.com` / `Bsandeep123?`, admin `admin@acme.com` /
  `Acme123?`, employee `eddie@acme.com` / `Emp123?`.
- This is a POC data model (Redis JSON, plaintext demo passwords). For production, move auth to Logto
  and the store to the real HRMS `notification-service` (see docs/ARCHITECTURE.md).
- The `/api/push/received` beacon log is in-memory (won't persist on serverless) — it's only a local
  test aid; real push delivery is unaffected.
