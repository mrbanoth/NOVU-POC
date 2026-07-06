# Push notifications - our own Web Push (VAPID), no Firebase

The Next.js app (`hrms-web/`) delivers **real browser push notifications** using the standard
**W3C Web Push protocol (VAPID)** - implemented in our own backend with the `web-push` library.
**No Firebase, no FCM, no external account.** The browser's built-in push service delivers the
message; notifications appear even when the tab is closed.

## How it works

```
  event (e.g. employee submits timesheet)
        -> notify() in lib/notify.js
             |-- Novu trigger      -> in-app bell (realtime socket) + email
             |-- sendPush()        -> web-push encrypts + POSTs to the browser's push endpoint
                                       -> service worker (public/sw.js) -> showNotification()  (real OS popup)
```

- **VAPID keys** (public + private) are generated once and live in `hrms-web/.env.local`
  (git-ignored). The private key signs push messages; the public key is handed to the browser.
- **Subscribe:** clicking **"Enable alerts"** registers `/sw.js`, calls
  `pushManager.subscribe({ applicationServerKey })`, and POSTs the subscription to
  `/api/push/subscribe` (stored per subscriber in `data/subs.json`).
- **Send:** `sendPush(subscriberId, {title, body, url})` iterates the subscriber's devices and
  calls `webpush.sendNotification(...)`. Expired subscriptions (404/410) are pruned automatically.
- **No duplicates:** the socket only updates the in-app bell; the native OS popup comes solely from
  Web Push (which `userVisibleOnly` requires the service worker to show anyway).

## Setup (already done for this repo)

```powershell
# generate a keypair (already in hrms-web/.env.local)
node -e "console.log(require('web-push').generateVAPIDKeys())"
# -> put PUBLIC/PRIVATE into VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in hrms-web/.env.local
```

## Test it (real Chrome/Edge/Firefox)

1. `cd hrms-web; npm run dev` -> open http://localhost:3005, sign in.
2. Click **"Enable alerts"** and **Allow** the browser permission prompt.
3. In another tab (or as another user), do an action that notifies you
   (e.g. Employee submits a timesheet -> the Tenant Admin).
4. A **real desktop notification pops** - even if you switch away or close the tab.
   Clicking it focuses/opens the app.

> Localhost is a secure context, so service workers + Web Push work over `http://localhost` with
> no HTTPS/cert needed. In production, serve the app over HTTPS.

## Why not route push through Novu?

Novu's community push providers are FCM / APNs / Expo / OneSignal / Pushpad / push-webhook - all
need an external account **or** (push-webhook) a callback the pinned `3.17.0` image's SSRF guard
blocks. Standard VAPID Web Push has no such dependency, so for a browser POC we own it directly.
Novu still owns in-app + email + realtime.

## Native mobile apps (later)

A future iOS/Android app would use **FCM/APNs/Expo via Novu** (`register_device()` in the Python
bridge already supports it) - additive, using the same composite subscriber id. Web Push covers all
desktop + mobile **browsers** today.
