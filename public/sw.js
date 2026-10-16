// HEMU.UZ Service Worker: ilova qobig'ini keshlaydi, internet yo'qolsa ham ochiladi
const VERSION = 'mxg-v31';
const SHELL = ['/', '/css/app.css', '/js/app.js', '/js/core.js', '/js/ui.js', '/js/art.js', '/js/dict.js', '/js/features.js', '/js/theme-init.js', '/favicon.svg', '/img/icon-192.png', '/offline.html', '/vendor/inter/inter.css', '/vendor/inter/inter-latin-wght-normal.woff2', '/vendor/inter/inter-cyrillic-wght-normal.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // API va real vaqt oqimi keshlanmaydi
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/') && url.pathname.includes('/docs/')) return;

  // Sahifalar: avval tarmoq, bo'lmasa kesh, bo'lmasa oflayn sahifa
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put('/', copy));
      return res;
    }).catch(() => caches.match('/').then((r) => r || caches.match('/offline.html'))));
    return;
  }
  // Kod (JS/CSS): avval tarmoq — yangilanishdan keyin eski va yangi modullar aralashmasligi uchun
  if (url.pathname.startsWith('/js/') || url.pathname.startsWith('/css/')) {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req)));
    return;
  }
  // Statik fayllar va rasmlar: kesh, fonda yangilash
  e.respondWith(caches.match(req).then((cached) => {
    const net = fetch(req).then((res) => {
      if (res.ok && (url.pathname.startsWith('/js/') || url.pathname.startsWith('/css/') || url.pathname.startsWith('/img/') || url.pathname.startsWith('/vendor/') || url.pathname.startsWith('/uploads/listings/'))) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => cached);
    return cached || net;
  }));
});

// ---------- Push-bildirishnomalar ----------
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'HEMU.UZ', {
    body: d.body || '',
    icon: '/img/icon-192.png',
    badge: '/img/icon-192.png',
    data: { link: d.link || '/' },
    tag: d.tag || undefined,
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || '/';
  const target = /^https:\/\//.test(link) ? link : new URL(link, self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if (c.url.startsWith(self.location.origin) && 'focus' in c) { c.navigate(target); return c.focus(); }
    }
    return self.clients.openWindow(target);
  }));
});