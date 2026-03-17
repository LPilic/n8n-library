// Service Worker — App Shell Cache
const CACHE_NAME = 'n8n-library-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/css/base.css',
  '/css/responsive.css',
  '/css/tickets.css',
  '/css/comments.css',
  '/css/kb.css',
  '/css/monitoring.css',
  '/css/dashboard.css',
  '/css/cmdpalette.css',
  '/css/notifications.css',
  '/js/app.js',
  '/js/settings.js',
  '/js/tickets.js',
  '/js/library.js',
  '/js/ai.js',
  '/js/kb.js',
  '/js/monitoring.js',
  '/js/observability.js',
  '/js/dashboard.js',
  '/js/notifications.js',
  '/js/cmdpalette.js',
  '/js/audit.js',
  '/js/alerts.js',
];

// Install — pre-cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network-first for API/HTML, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET, SSE streams, and cross-origin
  if (event.request.method !== 'GET') return;
  if (url.pathname.includes('/stream')) return;
  if (url.origin !== self.location.origin) return;

  // API requests — network only, never cache
  if (url.pathname.startsWith('/api/')) return;

  // Static assets (JS, CSS) — stale-while-revalidate
  if (url.pathname.match(/\.(js|css)$/)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const fetchPromise = fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // HTML navigation — network first, fallback to cache
  if (event.request.mode === 'navigate' || url.pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }
});
