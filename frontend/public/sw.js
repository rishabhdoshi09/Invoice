/**
 * Service Worker — Invoice App PWA
 *
 * Strategy:
 *  - App shell (HTML, JS, CSS):  Cache-first with network fallback
 *  - API calls (/api/*):          Network-only — never cache financial data
 *  - Navigation requests:         Serve /index.html from cache for offline SPA routing
 */

const CACHE_NAME = 'invoice-app-v1';

const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/manifest.json',
];

// ─── Install: precache the app shell ─────────────────────────────────────────
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

// ─── Activate: remove stale caches ────────────────────────────────────────────
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

// ─── Fetch: route requests ────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Only handle same-origin GET requests
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;

    // API calls: always go to network — never serve stale financial data
    if (url.pathname.startsWith('/api/')) return;

    event.respondWith(
        caches.match(request).then(cached => {
            // For navigation requests (page loads), always try network first
            // so the user gets the latest app version
            if (request.mode === 'navigate') {
                return fetch(request)
                    .then(response => {
                        // Cache the fresh response
                        if (response.ok) {
                            const clone = response.clone();
                            caches.open(CACHE_NAME).then(c => c.put(request, clone));
                        }
                        return response;
                    })
                    .catch(() => {
                        // Offline: serve the cached index.html so the React SPA still loads
                        return cached || caches.match('/index.html');
                    });
            }

            // Static assets (JS, CSS, fonts, images): cache-first
            if (cached) return cached;

            return fetch(request).then(response => {
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }
                const clone = response.clone();
                caches.open(CACHE_NAME).then(c => c.put(request, clone));
                return response;
            });
        })
    );
});

// ─── Message: skip waiting on demand ─────────────────────────────────────────
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
