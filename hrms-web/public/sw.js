/* HRMS Web Push service worker (VAPID, no Firebase). Served at /sw.js. v2 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = { title: "HRMS", body: "New notification", url: "/" };
  try { data = { ...data, ...event.data.json() }; } catch {}
  event.waitUntil((async () => {
    await self.registration.showNotification("HRMS: " + data.title, {
      body: data.body,
      tag: "hrms-" + Date.now(),
      requireInteraction: true, // stay on screen until the user dismisses it (unmissable)
      renotify: true,
      data: { url: data.url },
      icon: "/icon.png", // real PNG (Chrome-on-Windows can drop notifications with SVG/data-URI icons)
      badge: "/icon.png",
    });
    const cs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // Tell any open page that the push arrived (drives the in-app toast when a tab is open).
    cs.forEach((c) => c.postMessage({ __hrmsPush: data }));
    // Beacon the server so we can PROVE the SW fired even with NO tab open (POC verification).
    try {
      await fetch("/api/push/received", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: data.title, body: data.body, openTabs: cs.length, at: Date.now() }),
      });
    } catch (e) {}
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) { if ("focus" in w) return w.focus(); }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
