/**
 * Service Worker registration for PWA support.
 *
 * Usage in src/index.js:
 *   import * as serviceWorkerRegistration from './serviceWorkerRegistration';
 *   serviceWorkerRegistration.register();
 */

const isLocalhost = Boolean(
    window.location.hostname === 'localhost' ||
    window.location.hostname === '[::1]' ||
    window.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/)
);

export function register(config) {
    if (!('serviceWorker' in navigator)) return;

    const publicUrl = new URL(process.env.PUBLIC_URL, window.location.href);
    // SW won't work if PUBLIC_URL is on a different origin
    if (publicUrl.origin !== window.location.origin) return;

    window.addEventListener('load', () => {
        const swUrl = `${process.env.PUBLIC_URL}/sw.js`;

        if (isLocalhost) {
            // On localhost, verify the SW file exists and is valid JS
            checkValidServiceWorker(swUrl, config);
            navigator.serviceWorker.ready.then(() => {
                console.log('[SW] App is being served offline-first by the service worker.');
            });
        } else {
            registerValidSW(swUrl, config);
        }
    });
}

function registerValidSW(swUrl, config) {
    navigator.serviceWorker
        .register(swUrl)
        .then(registration => {
            registration.onupdatefound = () => {
                const installing = registration.installing;
                if (!installing) return;

                installing.onstatechange = () => {
                    if (installing.state !== 'installed') return;

                    if (navigator.serviceWorker.controller) {
                        // New content available — show "update ready" UI if configured
                        console.log('[SW] New app version available. Will activate on next page load.');
                        if (config && config.onUpdate) config.onUpdate(registration);
                    } else {
                        // First install — app is now cached for offline use
                        console.log('[SW] App cached for offline use.');
                        if (config && config.onSuccess) config.onSuccess(registration);
                    }
                };
            };
        })
        .catch(err => console.error('[SW] Registration failed:', err));
}

function checkValidServiceWorker(swUrl, config) {
    fetch(swUrl, { headers: { 'Service-Worker': 'script' } })
        .then(response => {
            const contentType = response.headers.get('content-type');
            if (
                response.status === 404 ||
                (contentType && !contentType.includes('javascript'))
            ) {
                // SW file not found — unregister and reload
                navigator.serviceWorker.ready.then(reg => {
                    reg.unregister().then(() => window.location.reload());
                });
            } else {
                registerValidSW(swUrl, config);
            }
        })
        .catch(() => console.log('[SW] No internet connection — app running in offline mode.'));
}

export function unregister() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
            .then(reg => reg.unregister())
            .catch(err => console.error('[SW] Unregister error:', err.message));
    }
}
