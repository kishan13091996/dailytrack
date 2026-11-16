/* Daily Track – service worker (offline support). Never touches your saved data. */
const CACHE = 'dailytrack-v7';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const EXTRA = ['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'];
const EXT_HOSTS = /(^|\.)(cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(CORE.map((u) => c.add(u).catch(() => {})));
    await Promise.all(EXTRA.map((u) => fetch(u, { mode: 'no-cors' }).then((r) => c.put(u, r)).catch(() => {})));
    self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE && k.startsWith('dailytrack-')) await caches.delete(k);
    await self.clients.claim();
  })());
});
const withTimeout = (p, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then((v) => { clearTimeout(t); res(v); }, (x) => { clearTimeout(t); rej(x); }); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (!same && !EXT_HOSTS.test(url.hostname)) return;

  // Pages: network first (so updates arrive), fall back to the saved copy when offline.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const r = await withTimeout(fetch(req), 4000);
        if (r && r.ok) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); }
        return r;
      } catch (_) {
        return (await caches.match(req, { ignoreSearch: true })) || (await caches.match('./')) || (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }
  // Everything else: saved copy first, refresh in the background.
  e.respondWith((async () => {
    const hit = await caches.match(req);
    const net = fetch(req).then((r) => { if (r && (r.ok || r.type === 'opaque')) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); } return r; }).catch(() => hit);
    return hit || net;
  })());
});
