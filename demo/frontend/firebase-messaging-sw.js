/* Firebase Cloud Messaging service worker - real BACKGROUND push (tab closed).
 * Served at the origin root by the demo backend (GET /firebase-messaging-sw.js).
 * Requires demo/frontend/firebase-config.js (copy from the .example). See docs/PUSH-FCM.md.
 */
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");
importScripts("/static/frontend/firebase-config.js"); // sets self.FIREBASE_CONFIG

firebase.initializeApp(self.FIREBASE_CONFIG);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  const d = payload.data || {};
  self.registration.showNotification("HRMS: " + (n.title || d.title || "Notification"), {
    body: n.body || d.message || "",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Ccircle cx='32' cy='32' r='32' fill='%237e52f4'/%3E%3C/svg%3E",
    data: d,
  });
});
