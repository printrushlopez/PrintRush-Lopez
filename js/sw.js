/* PrintRUSH Lopez — Service Worker
   Handles: offline caching, Web Push notifications, background sync */

const CACHE_NAME    = 'printrush-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/order.html',
  '/payment.html',
  '/confirmation.html',
  '/tracker.html',
  '/css/tokens.css',
  '/css/components.css',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap'
];

/* ── INSTALL: cache static assets ── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

/* ── ACTIVATE: clear old caches ── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ── FETCH: cache-first for static, network-first for API ── */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin API requests (Supabase, PayMongo)
  if (request.method !== 'GET') return;
  if (url.hostname.includes('supabase.co')) return;
  if (url.hostname.includes('paymongo.com')) return;
  if (url.hostname.includes('hcaptcha.com')) return;

  // Cache-first for static assets
  if (STATIC_ASSETS.some(a => request.url.includes(a)) ||
      url.pathname.match(/\.(css|js|png|jpg|svg|ico|woff2?)$/)) {
    event.respondWith(
      caches.match(request).then(cached =>
        cached || fetch(request).then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
          return res;
        })
      )
    );
    return;
  }

  // Network-first for HTML pages
  event.respondWith(
    fetch(request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(request, clone));
        return res;
      })
      .catch(() => caches.match(request).then(c => c || caches.match('/index.html')))
  );
});

/* ── PUSH NOTIFICATIONS ── */
self.addEventListener('push', (event) => {
  let data = { title: 'PrintRUSH', body: 'You have an update.', icon: '/icons/icon-192.png', badge: '/icons/icon-96.png', tag: 'printrush' };
  try { data = { ...data, ...event.data.json() }; } catch (e) {}

  const options = {
    body:    data.body,
    icon:    data.icon  || '/icons/icon-192.png',
    badge:   data.badge || '/icons/icon-96.png',
    tag:     data.tag   || 'printrush',
    data:    data.url   || '/',
    vibrate: [100, 50, 100],
    actions: data.actions || [],
    requireInteraction: data.requireInteraction || false
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

/* ── NOTIFICATION CLICK ── */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => {
        const existing = list.find(c => c.url.includes(self.location.origin));
        if (existing) { existing.focus(); existing.navigate(url); }
        else clients.openWindow(url);
      })
  );
});

/* ── BACKGROUND SYNC (for offline job submissions) ── */
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending-jobs') {
    event.waitUntil(syncPendingJobs());
  }
});

async function syncPendingJobs() {
  const db = await openPendingStore();
  const pending = await db.getAll();
  for (const job of pending) {
    try {
      await fetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(job) });
      await db.delete(job.id);
    } catch (e) { /* retry next sync */ }
  }
}

/* Simple IndexedDB helper for pending jobs */
function openPendingStore() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('printrush-offline', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('pending', { keyPath: 'id', autoIncrement: true });
    req.onsuccess = e => {
      const db = e.target.result;
      resolve({
        getAll: () => new Promise((res, rej) => { const r = db.transaction('pending').objectStore('pending').getAll(); r.onsuccess = () => res(r.result); r.onerror = rej; }),
        delete: (id) => new Promise((res, rej) => { const r = db.transaction('pending','readwrite').objectStore('pending').delete(id); r.onsuccess = res; r.onerror = rej; })
      });
    };
    req.onerror = reject;
  });
}
