"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

// Real-time in-app inbox + native push for one subscriber.
export function useInbox(subscriberId) {
  const [notifications, setNotifications] = useState([]);
  const [live, setLive] = useState(false);
  const sockRef = useRef(null);

  const reload = useCallback(async () => {
    if (!subscriberId) return;
    const r = await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscriberId }) });
    const j = await r.json();
    setNotifications(j.notifications || []);
  }, [subscriberId]);

  const markAllRead = useCallback(async () => {
    if (!subscriberId) return;
    await fetch("/api/notifications", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscriberId }) });
    setNotifications((ns) => ns.map((n) => ({ ...n, read: true })));
  }, [subscriberId]);

  // Grant notification permission AND subscribe the browser to Web Push (VAPID, no Firebase),
  // so notifications pop even when this tab is closed.
  const enableAlerts = useCallback(async () => {
    if (typeof Notification === "undefined") return "unsupported";
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return perm;
    try {
      if ("serviceWorker" in navigator && "PushManager" in window) {
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const { publicKey } = await (await fetch("/api/push/vapid")).json();
        if (publicKey) {
          const sub =
            (await reg.pushManager.getSubscription()) ||
            (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(publicKey) }));
          await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscriberId, subscription: sub }) });
        }
      }
    } catch {
      /* web push optional; in-app + foreground alert still work */
    }
    return "granted";
  }, [subscriberId]);

  useEffect(() => {
    if (!subscriberId) return;
    let socket;
    let alive = true;
    (async () => {
      await reload();
      const r = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscriberId }) });
      const { token, wsUrl } = await r.json();
      if (!alive || !token) return;
      socket = io(wsUrl, { transports: ["websocket"], auth: { token }, reconnection: true });
      sockRef.current = socket;
      socket.on("connect", () => setLive(true));
      socket.on("disconnect", () => setLive(false));
      socket.on("connect_error", () => setLive(false));
      // Socket = instant in-app bell update. The native OS popup comes from Web Push (below),
      // which fires even when the tab is closed, so we don't double-notify here.
      socket.on("notification_received", () => reload());
    })();
    return () => { alive = false; setLive(false); if (socket) socket.disconnect(); };
  }, [subscriberId, reload]);

  const unread = notifications.filter((n) => !n.read).length;
  return { notifications, unread, live, markAllRead, enableAlerts, reload };
}

function urlB64ToUint8(base64) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
