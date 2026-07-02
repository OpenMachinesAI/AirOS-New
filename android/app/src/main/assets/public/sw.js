const CACHE_NAME = 'airo-voice-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(err => {
        console.warn("Service worker asset pre-caching skipped/failed: ", err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = event.request.url;
  // Bypassing any websockets, api endpoints or external assets that are stream-based
  if (
    url.includes('/api/') || 
    url.startsWith('ws') || 
    url.includes('socket.io') || 
    url.includes('youtube.com') || 
    url.includes('ggpht.com') || 
    url.includes('googlevideo.com')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then(networkResponse => {
        // Cache new successful GET queries for local assets
        if (
          networkResponse && 
          networkResponse.status === 200 && 
          event.request.method === 'GET' &&
          (url.includes(self.location.origin) || url.includes('esm.sh') || url.includes('jsdelivr'))
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Fallback or ignore
      });
    })
  );
});
