// Schema changes describe cache contracts. The build injects a content-derived deployment ID.
const CACHE_PREFIX = 'volt-garage-';
const CACHE_SCHEMA = 'schema2';
const BUILD_ID = '__VOLT_BUILD_ID__';
const CACHE_BASE = `${CACHE_PREFIX}${CACHE_SCHEMA}-${BUILD_ID}`;
const STATIC_CACHE = `${CACHE_BASE}-static`;
const HTML_CACHE = `${CACHE_BASE}-html`;
const ASSETS_CACHE = `${CACHE_BASE}-assets`;
const OWNED_CACHES = [STATIC_CACHE, HTML_CACHE, ASSETS_CACHE];
const PRECACHE_URLS = [
  /* __VOLT_PRECACHE__ */
].flat();
const OFFLINE_URL = '/offline.html';
const SKIP_CACHE_PATHS = new Set([
  '/sw.js',
  '/_redirects',
  '/_headers',
  '/robots.txt',
  '/sitemap.xml',
]);

const trimCache = async (cache, maxEntries) => {
  const keys = await cache.keys();
  await Promise.all(
    keys.slice(0, Math.max(0, keys.length - maxEntries)).map((key) => cache.delete(key))
  );
};

const storeResponse = async (cache, request, response, limit) => {
  if (response.ok) {
    try {
      await cache.put(request, response.clone());
      await trimCache(cache, limit);
    } catch {
      // A cache write failure must not replace a usable network response with stale content.
    }
  }
  return response;
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' })));
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && !OWNED_CACHES.includes(key))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    SKIP_CACHE_PATHS.has(url.pathname)
  )
    return;

  const isHtml =
    request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');
  const isImmutable = /^\/build\/.+-[\w-]{8,}\.(?:css|js)$/.test(url.pathname);
  const isAsset =
    ['style', 'script', 'image', 'font'].includes(request.destination) ||
    url.pathname.startsWith('/data/') ||
    url.pathname === '/site.webmanifest';
  if (!isHtml && !isImmutable && !isAsset) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(isHtml ? HTML_CACHE : ASSETS_CACHE);
      const shell = await caches.open(STATIC_CACHE);
      const cached = (await cache.match(request)) || (await shell.match(request));
      if (isImmutable && cached) return cached;
      try {
        // Stable URLs must revalidate; only content-addressed bundles are cache-first.
        const response = await fetch(request, { cache: 'no-cache' });
        return await storeResponse(cache, request, response, isHtml ? 20 : 60);
      } catch {
        return cached || (isHtml && (await shell.match(OFFLINE_URL))) || Response.error();
      }
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
