self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "JUJA_CUSTOMER_NOTIFICATION") return;

  const payload = data.payload || {};
  const title = payload.title || "Juja Brew & Bites";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/images/juja-logo.png",
    badge: payload.badge || "/images/juja-logo.png",
    tag: payload.tag || "juja-customer-order",
    renotify: true,
    requireInteraction: Boolean(payload.requireInteraction),
    vibrate: payload.vibrate || [220, 90, 220],
    data: {
      url: payload.url || "/customer",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/customer";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const targetUrl = new URL(url, self.location.origin).href;
      for (const client of clients) {
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return null;
    })
  );
});
