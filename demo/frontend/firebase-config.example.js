// Copy this file to `firebase-config.js` and paste YOUR Firebase web app config + VAPID key.
// These values are PUBLIC (safe in the browser). The private service-account JSON goes to
// Novu only (Dashboard > Integrations > FCM), never here. See docs/PUSH-FCM.md.
//
// `self` works in both the page and the service worker, so this one file feeds both.

self.FIREBASE_CONFIG = {
  apiKey: "PASTE_apiKey",
  authDomain: "PASTE_projectId.firebaseapp.com",
  projectId: "PASTE_projectId",
  storageBucket: "PASTE_projectId.appspot.com",
  messagingSenderId: "PASTE_messagingSenderId",
  appId: "PASTE_appId",
};

// Cloud Messaging > Web Push certificates > "Key pair" (public VAPID key).
self.FIREBASE_VAPID_KEY = "PASTE_vapidKey";
