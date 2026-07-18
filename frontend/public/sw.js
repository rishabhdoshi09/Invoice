/**
 * Service Worker — Invoice App PWA
 *
 * Strategy (NETWORK-FIRST — corrected):
 *  - API calls (/api/*):          Network-only — never cache financial data.
 *  - Everything else (HTML/JS/CSS): Network-first — always fetch the latest
 *    from the server; fall back to cache ONLY when the network is down.
 *
 * Why network-first, not cache-first: this app runs against a local backend
 * and is effectively always online. Cache-first served a stale JS bundle,
 * so code fixes (and the data they fetch) silently didn't take effect until
 * the cache was manually cleared. For a financial app, showing stale numbers
 * is far worse than a few ms saved on a warm asset. The cache now exists only
 * as an offline fallback.
 *
 * CACHE_NAME bumped to v2 so the old cache-first store is purged on activate.
 */

const CACHE_NAME = 'invoice-app-v2';

const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/manifest.json',
];

// ─── Install: precache the app shell, take over immediately ──────────────────
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(PRECACHE_URLS).catch(() => {}))
            .then(() => self.skipWaiting())
    );
});

// ─── Activate: delete ALL old caches, claim open tabs at once ────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

// ─── Fetch: network-first for the app, network-only for the API ──────────────
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Only handle same-origin GET requests
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;

    // API calls: always go straight to the network — never serve cached
    // financial data (returning lets the browser handle it normally).
    if (url.pathname.startsWith('/api/')) return;

    // App shell + static assets: NETWORK-FIRST.
    // Fresh copy when online (the normal case); cached copy only if offline.
    event.respondWith(
        fetch(request)
            .then(response => {
                if (response && response.ok && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(c => c.put(request, clone));
                }
                return response;
            })
            .catch(() =>
                caches.match(request).then(cached =>
                    cached || (request.mode === 'navigate' ? caches.match('/index.html') : undefined)
                )
            )
    );
});
