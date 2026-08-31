const CACHE_VERSION = 'volt-garage-v1.0.4';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const HTML_CACHE = `${CACHE_VERSION}-html`;
const ASSETS_CACHE = `${CACHE_VERSION}-assets`;

const OFFLINE_URL = '/offline.html';
const SKIP_CACHE_PATHS = new Set(['/_redirects', '/_headers', '/robots.txt', '/sitemap.xml']);

const precache = async () => {
  const cache = await caches.open(STATIC_CACHE);
  await cache.addAll([OFFLINE_URL, '/']);
};

const isHtmlRequest = (request) =>
  request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');

const trimCache = async (cacheName, maxEntries) => {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await cache.delete(keys[0]);
  await trimCache(cacheName, maxEntries);
};

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const deletions = keys
        .filter((key) => !key.startsWith(CACHE_VERSION))
        .map((key) => caches.delete(key));
      await Promise.all(deletions.length ? deletions : [Promise.resolve()]);
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (SKIP_CACHE_PATHS.has(url.pathname)) {
    event.respondWith(fetch(request));
    return;
  }

  if (isHtmlRequest(request)) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response && response.ok) {
            const cache = await caches.open(HTML_CACHE);
            cache.put(request, response.clone());
            trimCache(HTML_CACHE, 20);
          }
          return response;
        } catch (error) {
          const cached = await caches.match(request);
          return cached || caches.match(OFFLINE_URL);
        }
      })()
    );
    return;
  }

  const destination = request.destination;
  const isStyleOrScript = destination === 'style' || destination === 'script';
  const isImageOrFont = destination === 'image' || destination === 'font';

  if (isStyleOrScript) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSETS_CACHE);
        const cached = await cache.match(request);
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response && response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })()
    );
    return;
  }

  if (isImageOrFont) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSETS_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response && response.ok) {
            cache.put(request, response.clone());
            trimCache(ASSETS_CACHE, 60);
          }
          return response;
        } catch (error) {
          return cached;
        }
      })()
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
