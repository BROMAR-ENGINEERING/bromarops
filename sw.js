/* ============================================================
   BROMAR OPS — SERVICE WORKER
   Strategy: network-first, fall back to cache when offline.
   ============================================================ */

const CACHE = 'bromar-ops-runtime';

const PRECACHE_URLS = [
  'index.html',
  'css/styles.css',
  'js/core.js',
  'js/pages/dashboard.js',
  'js/pages/jobs.js',
  'js/pages/quotes.js',
  'js/pages/scheduling.js',
  'js/pages/timesheets.js',
  'js/pages/employees.js',
  'js/pages/ims.js',
  'js/pages/fleet.js',
  'js/pages/equipment.js',
  'js/pages/clients.js',
  'js/pages/tasks.js',
  'js/pages/materials.js',
  'js/pages/admin.js',
  'js/pages/testtag.js',
  'manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(PRECACHE_URLS).catch(() => {})
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => cached || caches.match('index.html'))
      )
  );
});
