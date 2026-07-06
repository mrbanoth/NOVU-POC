/* HRMS Web Push service worker (VAPID, no Firebase). Served at /sw.js. */
self.addEventListener("push", (event) => {
  let data = { title: "HRMS", body: "New notification", url: "/" };
  try { data = { ...data, ...event.data.json() }; } catch {}
  event.waitUntil(
    self.registration.showNotification("HRMS: " + data.title, {
      body: data.body,
      tag: "hrms-" + Date.now(),
      data: { url: data.url },
      icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Crect width='96' height='96' rx='20' fill='%237e52f4'/%3E%3Ctext x='48' y='62' font-size='46' text-anchor='middle' fill='white' font-family='sans-serif'%3EH%3C/text%3E%3C/svg%3E",
    })
  );
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
