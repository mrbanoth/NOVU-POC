# Push notifications - two levels

The POC delivers push in two tiers. Tier 1 works out of the box; Tier 2 adds true
closed-tab delivery and needs a free Firebase project.

## Tier 1 - Foreground native notifications (working now, no setup)

When you're signed in, the browser holds a live socket to Novu (`:3011`). The moment a
notification arrives, the demo raises a **real Chrome OS notification** via the Notification
API (click **"Enable browser alerts"** once to grant permission). This is a genuine desktop
popup - it just requires the tab to be open. Nothing to configure.

## Tier 2 - Background push with FCM (tab closed / phone)

For notifications when the tab is closed (or on a phone), the browser needs a push service.
Chrome's is **Firebase Cloud Messaging (FCM)**. Novu's community edition ships an FCM provider.

### One-time Firebase setup (~10 min, free)

1. https://console.firebase.google.com -> **Add project** (any name, disable Analytics).
2. **Project settings -> General -> Your apps -> Web (`</>`)** -> register an app. Copy the
   `firebaseConfig` object.
3. **Project settings -> Cloud Messaging -> Web configuration -> Web Push certificates ->
   Generate key pair.** Copy the key (this is the **VAPID key**).
4. **Project settings -> Service accounts -> Generate new private key** -> downloads a JSON.
   This is the **server** credential (keep it secret).

### Wire it in

1. `cp demo/frontend/firebase-config.example.js demo/frontend/firebase-config.js` and paste your
   web config + VAPID key (both are public; the file is git-ignored anyway).
2. In the Novu dashboard: **Integrations -> Push -> Firebase Cloud Messaging -> Connect**, paste
   the **service account JSON**, mark it active. (Or `POST /v1/integrations` with
   `providerId:"fcm"`, `credentials.serviceAccount` = the JSON string.)
3. Add the FCM registration to the demo frontend (a "Enable device push" button that calls
   `getToken(messaging,{vapidKey})` then `POST /api/demo/push/register {subscriber, device_token,
   provider:"fcm"}`). The backend + `register_device(PushProvider.FCM, ...)` already handle it.
4. Ensure the workflows keep a **Push** step (they do: `hrms-task`, `hrms-timesheet`,
   `hrms-announcement`). `scripts/configure.ps1` leaves push to FCM by design.

### Result

Trigger a push-bearing workflow (e.g. Tenant Admin **Assign a task**) with the tab closed ->
Chrome shows the notification via the FCM service worker (`demo/frontend/firebase-messaging-sw.js`,
served at `/firebase-messaging-sw.js`). Same subscriber id, so tenant isolation still holds; a
mobile app registers an FCM/APNS/Expo token through the exact same path.

> Why not a local webhook instead of FCM? The pinned Novu `3.17.0` image's SSRF guard blocks
> callbacks to `host.docker.internal` (private IP) and lacks the `NOVU_SAFE_OUTBOUND_ALLOW`
> allow-list added in later versions - and a webhook is not a real browser notification anyway.
