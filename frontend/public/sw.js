/* Gexia360 Service Worker — handles Web Push notifications.
   Lives at /sw.js (registered with scope "/"). */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'Gexia360', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'Gexia360';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/apple-touch-icon.png',
    badge: payload.badge || '/apple-touch-icon.png',
    tag: payload.tag || 'gexia',
    data: { url: payload.url || '/', ts: payload.ts || Date.now() },
    requireInteraction: false,
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((winClients) => {
      // If an existing tab/window is open → focus + navigate
      for (const c of winClients) {
        if ('focus' in c && 'navigate' in c) {
          c.focus();
          try { c.navigate(targetUrl); } catch {}
          return;
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
