"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

// Real-time in-app inbox + native push for one subscriber.
export function useInbox(subscriberId) {
  const [notifications, setNotifications] = useState([]);
  const [live, setLive] = useState(false);
  const [lastPush, setLastPush] = useState(null);
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
  // so notifications pop even when this tab is closed. Returns {ok, reason}.
  const enableAlerts = useCallback(async () => {
    if (typeof Notification === "undefined") return { ok: false, reason: "This browser has no Notifications API" };
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return { ok: false, reason: perm === "denied" ? "You blocked notifications for this site" : "Permission not granted" };
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return { ok: false, reason: "Push not supported here" };
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const { publicKey } = await (await fetch("/api/push/vapid")).json();
      if (!publicKey) return { ok: false, reason: "Server has no VAPID key" };
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(publicKey) }));
      const r = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscriberId, subscription: sub }) });
      if (!r.ok) return { ok: false, reason: "Server rejected the subscription" };
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: String(e?.message || e) };
    }
  }, [subscriberId]);

  // Send a push to my own devices right now (verify end-to-end). Returns {devices, sent, results}.
  const testPush = useCallback(async () => {
    const r = await fetch("/api/push/self-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscriberId }) });
    return await r.json();
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

  // In-app toast when a Web Push reaches the service worker — visible proof the push arrived
  // even if Windows/Chrome suppresses the OS banner.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
    const handler = (e) => {
      if (e.data && e.data.__hrmsPush) {
        setLastPush({ ...e.data.__hrmsPush, at: Date.now() });
        reload();
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [reload]);

  const unread = notifications.filter((n) => !n.read).length;
  return { notifications, unread, live, lastPush, markAllRead, enableAlerts, testPush, reload };
}

function urlB64ToUint8(base64) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
