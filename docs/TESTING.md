# Manual Test Guide - HRMS x Novu POC

Three roles: **Superadmin**, **Tenant Admin**, **Employee**. Two tenants (acme, globex) prove
isolation. Verified working on Docker 29.4.3 + Python 3.14 (Windows 11), Novu 3.17.0.

---

## 0. Start it (3 commands)

```powershell
cd deploy; docker compose --env-file .env up -d           # 1. Novu
cd ..;     powershell -File scripts/configure.ps1         # 2. provision YOUR org (uses deploy/.env NOVU_API_KEY)
cd demo/backend; pip install -r requirements.txt; uvicorn app:app --host 0.0.0.0 --port 4200   # 3. demo
```
Open **http://localhost:4200**.

> `configure.ps1` provisions an org you already created in the dashboard (reads NOVU_API_KEY from
> `deploy/.env`). To create + provision a brand-new org headlessly instead, use `bootstrap.ps1`.

---

## 1. The people (left sidebar - "Sign in as")

| Person | Role | Can do |
|---|---|---|
| Sam | Superadmin | Post platform announcement (-> all tenant admins); simulate tenant provisioned (-> superadmin) |
| Alice | Tenant Admin (Acme) | Approve timesheet, Assign task, Announce holiday (-> Acme employees) |
| Eddie | Employee (Acme) | Submit timesheet, Request leave (-> Acme admins) |
| Gina | Tenant Admin (Globex) | same admin actions, for Globex |
| Greg | Employee (Globex) | same employee actions, for Globex |

---

## 2. TEST: in-app bell + real-time socket (the headline)

Best shown with **two browser tabs**:

1. Tab A -> **http://localhost:4200** -> click **"Enable browser alerts"** (grant permission) ->
   sign in as **Alice (Acme Admin)**. Top-right status turns **green "Live"** (socket connected).
2. Tab B -> **http://localhost:4200** -> sign in as **Eddie (Acme Employee)** -> click
   **"Submit my timesheet"**.
3. **Expected in Tab A, instantly (no refresh):**
   - the **bell badge** increments,
   - a **Chrome notification pops up** ("HRMS: Timesheet submitted"),
   - opening the bell shows "Timesheet submitted - Eddie submitted a weekly timesheet...".

Green light = socket connected; if Novu WS stops, it turns **red "Offline"**. Click the bell ->
**Mark all read** clears the badge.

---

## 3. TEST: tenant isolation

1. Sign in as **Gina (Globex Admin)**. Her bell does **NOT** show Eddie's Acme timesheet -
   only Globex items + platform announcements.
2. Sign in as **Greg (Globex Employee)** -> empty unless a Globex admin acted on him.

Same mechanism, same code, different tenant prefix in the subscriber id -> zero cross-tenant leak.

---

## 4. TEST: the role flows

| Do this as... | Then sign in as... | Expect in the bell |
|---|---|---|
| Eddie -> Submit timesheet / Request leave | Alice | "Timesheet submitted" / "Leave request" |
| Alice -> Approve timesheet / Assign task | Eddie | "Timesheet approved" / "New task assigned" |
| Alice -> Announce holiday | Eddie | "Company holiday" |
| Sam -> Post platform announcement | Alice AND Gina | "Scheduled maintenance" |
| Sam -> Simulate tenant provisioned | Sam | "New tenant provisioned" |

---

## 5. TEST: email

Every notification with an email step also lands in **Mailpit -> http://localhost:8025**
(business-event email - the channel HRMS has nothing for today).

---

## 6. TEST: push notifications (real, no Firebase)

The Next.js app (`hrms-web`, port 3005) ships **our own Web Push (VAPID)** — real browser
notifications with **no Firebase**, working even when the tab is closed.

1. Sign in at http://localhost:3005, click **"Enable alerts"**, and **Allow** the prompt.
2. In another tab / as another user, trigger a notification to you (e.g. Employee submits a
   timesheet → Tenant Admin).
3. A **real desktop notification pops** — switch away or close the tab, it still arrives; clicking
   it focuses the app. Design + details: **[PUSH.md](PUSH.md)**.

---

## 7. TEST: resilience (Novu can't break HRMS)

```powershell
cd deploy; docker compose stop novu-api novu-worker
```
Do any action -> the demo returns cleanly (bridge times out, swallows the error); the socket light
goes **red**. Restart: `docker compose start novu-api novu-worker` -> light returns to green.

---

## Automated check
```powershell
powershell -File scripts/smoke-test.ps1     # health + HMAC parity + a live trigger
```

## Dashboard (http://localhost:4000)
Activity Feed = every send with per-step status. Subscribers = `acme:*`, `globex:*`,
`platform:*` as separate, isolated entries.

## Troubleshooting
| Symptom | Fix |
|---|---|
| Status stuck "Offline"/red | `novu-ws` container down -> `docker compose up -d novu-ws`; check `:3011/v1/health-check` |
| Bell empty after an action | you're signed in as the actor, not a recipient - sign in as the recipient (see table) |
| No Chrome popup | click "Enable browser alerts"; the tab must be open (background needs FCM) |
| "auth failed" on sign-in | HMAC off or wrong key -> re-run `configure.ps1` |
| No email in Mailpit | re-run `configure.ps1` (creates the SMTP integration) |

## Teardown
```powershell
cd deploy; docker compose stop          # keep data;  add -v to wipe and start fresh
```
