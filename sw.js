/* ============================================================
   BROMAR OPS — SERVICE WORKER
   Path: sw.js
   V1.08
   Strategy:
     • Navigations (HTML), JS and CSS  → NETWORK-FIRST
         always fetch fresh when online; fall back to cache offline.
         Fixes staff getting stale cached builds.
     • Images / fonts / other assets   → CACHE-FIRST
         served from cache for speed; fetched + cached on first miss.
     • Non-GET and cross-origin         → passthrough (not handled).
   Bumping CACHE name auto-purges old caches on activate.
   ============================================================ */

const CACHE = 'bromar-ops-v1-10';

const PRECACHE_URLS = [
  'index.html',
  'login.html',
  'manifest.json',
  'css/styles.css',
  'js/config.js',
  'js/auth.js',
  'js/utils.js',
  'js/core.js',
  'js/bromar-report-kit.js',
  'js/bromar-form-kit.js',
  'js/pages/dashboard.js',
  'js/pages/jobs.js',
  'js/pages/quotes.js',
  'js/pages/scheduling.js',
  'js/pages/timesheets.js',
  'js/pages/employees.js',
  'js/pages/ims.js',
  'js/pages/ims/ims-report-kit.js',
  'js/pages/ims/ims-audit.js',
  'js/pages/ims/ims-document-builder.js',
  'js/pages/ims/ims-bromar-hub-job-requirements.js',
  'js/pages/ims/ims-bromar-hub-jobsheets.js',
  'js/pages/ims/ims-placeholders.js',
  'js/pages/ims/ims-safety-approved-swms.js',
  'js/pages/compliance.js',
  'js/pages/fleet.js',
  'js/pages/equipment.js',
  'js/pages/clients.js',
  'js/pages/tasks.js',
  'js/pages/materials.js',
  'js/pages/admin.js',
  'js/pages/testtag.js',
  'js/pages/_components.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
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

/* ── Is this a request that must stay fresh? (HTML / JS / CSS) ── */
function isFreshFirst(req) {
  if (req.mode === 'navigate') return true;            // HTML page loads
  const dest = req.destination;
  if (dest === 'document' || dest === 'script' || dest === 'style') return true;
  // Fallback for requests with no destination hint (some browsers):
  const path = new URL(req.url).pathname;
  return /\.(?:html|js|css)$/i.test(path);
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
    }
    return res;
  } catch (err) {
    const cached = await caches.match(req);
    if (cached) return cached;
    if (req.mode === 'navigate') {
      const shell = await caches.match('index.html');
      if (shell) return shell;
    }
    throw err;
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(isFreshFirst(req) ? networkFirst(req) : cacheFirst(req));
});
