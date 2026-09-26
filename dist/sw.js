/* Apparatus PWA service worker.
 *
 * Deliberately network-first for everything: the app is Firebase-backed and ships
 * frequent builds, so serving a stale cached shell would be worse than a slow load.
 * The cache exists purely as an offline fallback.
 */
const CACHE = 'apparatus-v1';
const OFFLINE_URLS = ['/', '/index.html', '/manifest.json', '/logo.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(OFFLINE_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never intercept cross-origin calls (Firebase, YouTube, map tiles, backend API).
  if (url.origin !== self.location.origin) return;

  // SPA navigations: network first, fall back to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('/index.html', copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match('/index.html').then((r) => r || Response.error()))
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request).then((r) => r || Response.error()))
  );
});

/* Web Push Notification Delivery (Supports iOS 16.4+ Home Screen PWA without Apple Dev Program) */
self.addEventListener('push', (event) => {
  let data = { title: 'APPARATUS', body: 'You have a new update.' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: 'APPARATUS', body: event.data.text() };
    }
  }

  const title = data.title || data.notification?.title || 'APPARATUS';
  const body = data.body || data.notification?.body || '';
  const options = {
    body,
    icon: '/app-icon-192.png',
    badge: '/app-icon-192.png',
    data: data.data || data,
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.link || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

