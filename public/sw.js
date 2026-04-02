const CACHE_NAME = 'airo-shell-v4';
const APP_SHELL = ['/', '/mobile.html', '/manifest.webmanifest', '/manifest-mobile.webmanifest', '/loading-dips.wav'];

const isNavigationRequest = (request) => request.mode === 'navigate';
const isSameOrigin = (url) => new URL(url).origin === self.location.origin;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  if (!isSameOrigin(event.request.url)) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (isNavigationRequest(event.request)) {
          return caches.match('/');
        }
        throw new Error(`Offline and no cache entry for ${event.request.url}`);
      })
  );
});
