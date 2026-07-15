/* ============================================================
   BROMAR OPS — SERVICE WORKER
   V1.02
   Strategy: network-first, fall back to cache when offline.
   - Cache name bumped so old caches get purged on next visit.
   - Precache uses allSettled so one 404 doesn't kill the whole install.
   ============================================================ */

const CACHE = 'bromar-ops-v1-02';

const PRECACHE_URLS = [
  'index.html',
  'login.html',
  'manifest.json',
  'css/styles.css',
  'js/auth.js',
  'js/core.js',
  'js/bromar-report-kit.js',
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
  'js/pages/testtag.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // allSettled = one 404 won't abort the whole precache
      Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => console.warn('[sw] precache skipped:', url, err.message))
        )
      )
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
        // only cache successful responses
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => cached || caches.match('index.html'))
      )
  );
});
