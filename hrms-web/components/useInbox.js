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

  const enableAlerts = useCallback(async () => {
    if (typeof Notification === "undefined") return "unsupported";
    return await Notification.requestPermission();
  }, []);

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
      socket.on("notification_received", (d) => {
        const m = (d && d.message) || {};
        const title = m.subject || m.payload?.title || "New notification";
        const body = m.content || m.body || m.payload?.message || "";
        popNative(title, body);
        reload();
      });
    })();
    return () => { alive = false; setLive(false); if (socket) socket.disconnect(); };
  }, [subscriberId, reload]);

  const unread = notifications.filter((n) => !n.read).length;
  return { notifications, unread, live, markAllRead, enableAlerts, reload };
}

function popNative(title, body) {
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification("HRMS: " + title, {
        body,
        icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Ccircle cx='32' cy='32' r='32' fill='%237e52f4'/%3E%3C/svg%3E",
      });
    } catch {}
  }
}
