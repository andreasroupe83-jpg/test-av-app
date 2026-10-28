// Nätverket först, sparad kopia som reserv – så appen fungerar även offline.
const CACHE = 'kalender-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request, { cache: 'no-store' });
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch (err) {
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      throw err;
    }
  })());
});
