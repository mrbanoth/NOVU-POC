# Manual Test Guide - HRMS x Novu POC

How to prove the POC works, from a cold start, with the exact expected result for each step.
Nothing here needs the HRMS app - the POC is self-contained.

Verified working on Docker 29.4.3 + Python 3.14 (Windows 11). Novu 3.17.0.

---

## 0. Prerequisites

- Docker Desktop running.
- Python 3.11+ on PATH (for the demo backend).
- Ports free on the host: 3010, 3011, 4000, 4200, 8025.

---

## 1. Start everything (one time, ~3 commands)

```powershell
# A. bring up the Novu stack
cd deploy
docker compose --env-file .env up -d

# B. configure Novu with zero clicks (org, keys, HMAC, integrations, workflows)
cd ..
powershell -ExecutionPolicy Bypass -File scripts/bootstrap.ps1

# C. run the demo backend (serves the Inbox + push pages, and the 3 bridge endpoints)
cd demo/backend
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 4200
```

Leave the demo backend running in that terminal. Open the others as needed.

**Expected:** `bootstrap.ps1` ends with `DONE. Novu is fully configured.` and prints the dashboard
login. The demo backend logs `Uvicorn running on http://127.0.0.1:4200`.

---

## 2. Automated smoke test (fastest confidence check)

```powershell
powershell -ExecutionPolicy Bypass -File scripts/smoke-test.ps1
```

**Expected - all green:**
```
[OK]  API healthy (v3.17.0)
[OK]  subscriberHash(...) = ....          <- HMAC computed
[OK]  trigger acknowledged (transactionId txn_...)
```
If the trigger line errors with "workflow ... active?", re-run `bootstrap.ps1`.

---

## 3. TEST: In-app Inbox + tenant isolation  (the headline)

1. Open **http://localhost:4200**.
2. Tenant = **acme**, keep the default user id, click **Open Inbox**.
   - **Expected:** status turns green "Session OK for acme"; `subscriberId` shows `acme:...`,
     `subscriberHash` shows a hex value.
3. Click **Send test notification**, wait ~1.5 s.
   - **Expected:** a "Timesheet approved" item appears in the feed; unread count increments.
4. Switch tenant to **globex** (same user id), click **Open Inbox**.
   - **Expected:** the feed is **empty** (or only globex's own items). acme's notification is **NOT**
     visible. This is the tenant-isolation proof: same user id, different tenant -> different subscriber.
5. Send a test as globex, then switch back to acme and Open Inbox again.
   - **Expected:** acme sees only acme's items, globex only globex's. No crossover, ever.

**What this proves:** the in-app feed is isolated per tenant by the HMAC-signed subscriber id, not by
trust. The browser only ever receives a hash the backend signed for that exact subscriber.

---

## 4. TEST: HMAC is actually enforced (negative test)

Proves isolation can't be bypassed by tampering.

```powershell
$api="http://localhost:3010"; $appId="G9QlB04p7gqU"   # from deploy/.env NOVU_APPLICATION_IDENTIFIER
$body = @{ applicationIdentifier=$appId; subscriber=@{ subscriberId="acme:u1" }; subscriberHash="deadbeef_wrong" } | ConvertTo-Json
try { Invoke-RestMethod -Method POST "$api/v1/inbox/session" -Headers @{'Content-Type'='application/json';'Origin'='http://localhost:4200'} -Body $body }
catch { "Rejected as expected: $($_.Exception.Message)" }
```

**Expected:** `400 ... Please provide a valid HMAC hash`. A forged/absent hash cannot open a feed.

---

## 5. TEST: Email leg (business events -> email)

1. With the demo backend up, send a notification from the Inbox page (step 3), or run the smoke test.
2. Open **http://localhost:8025** (Mailpit).
   - **Expected:** an email titled **"Timesheet approved"** with an "Open in HRMS" deep link.
   - This is the gap the current HRMS has today - business events had **no** email leg at all.

---

## 6. TEST: Push pipeline (local, no Firebase)

1. Open **http://localhost:4200/push** (leave it open; it polls every 2s).
2. Trigger the **hrms-task** workflow (it has a push step) to the Push Webhook sink:
   ```powershell
   $api="http://localhost:3010"; $k=(Get-Content deploy/.env | Select-String '^NOVU_API_KEY=').ToString().Split('=')[1]
   $b = @{ name="hrms-task"; to=@{ subscriberId="acme:u1"; email="u1@acme.test" }; payload=@{ title="Task assigned"; message="You have a new task"; category="task" } } | ConvertTo-Json -Depth 10
   Invoke-RestMethod -Method POST "$api/v1/events/trigger" -Headers @{ Authorization="ApiKey $k"; 'Content-Type'='application/json' } -Body $b
   ```
   - **Expected:** within a few seconds the push JSON appears on the `/push` page.
   - For **real** browser/mobile push, swap the Push Webhook integration for **FCM** (needs a free
     Firebase project) - the bridge's `register_device(provider=PushProvider.FCM, ...)` handles it.

---

## 7. TEST: Best-effort / resilience (the safety proof)

Proves Novu can never break an HRMS business action.

```powershell
cd deploy; docker compose stop novu-api novu-worker      # simulate Novu outage
```
Now trigger from the Inbox page (or call the demo `/api/demo/trigger`).
- **Expected:** the demo call still returns `{"triggered": false}` **without hanging or erroring** -
  the bridge times out (<=3s) and swallows the failure. In real HRMS, the timesheet submit still
  succeeds and the legacy SSE bell still delivers (dual mode). Restart with:
```powershell
docker compose start novu-api novu-worker
```

---

## 8. TEST: Dashboard verification (what Novu actually did)

Open **http://localhost:4000** (login `admin@hrms-poc.local` / `HrmsPoc!2026x`):
- **Activity Feed:** every trigger, per subscriber, with per-step status (in-app/email/push).
- **Subscribers:** search - you should see `acme:u1` and `globex:u1` as **separate** subscribers.
- **Workflows:** `hrms-generic`, `hrms-timesheet`, `hrms-task`, `hrms-approval`.
- **Integrations:** In-App (HMAC on), SMTP (Mailpit), Push Webhook.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| bootstrap: "API not healthy" | stack still starting - wait 30s, `docker compose ps` until all `healthy` |
| Inbox "session rejected" 400 | HMAC not enabled -> re-run `bootstrap.ps1`; or wrong app id in `deploy/.env` |
| Feed loads but empty after send | workflow missing/inactive -> re-run `bootstrap.ps1`; check Activity Feed |
| No email in Mailpit | SMTP integration missing -> re-run bootstrap; check the workflow has an Email step |
| demo health `secret_key_set:false` | `NOVU_API_KEY` empty in `deploy/.env` -> run `bootstrap.ps1` |
| Port already in use | another service on 3010/4000/4200 - stop it or change ports in `deploy/.env` |

---

## One-line teardown

```powershell
cd deploy; docker compose down          # keep data (Mongo volume)
cd deploy; docker compose down -v       # full reset (wipes org/workflows/subscribers)
```
After `down -v`, re-run `bootstrap.ps1` to reconfigure from scratch.
