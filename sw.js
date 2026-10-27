// Hexlands service worker. It makes the app installable and keeps the app shell available offline.
// Game traffic (the /api routes, including the live event stream) is never touched: it always goes to the network.
'use strict';
const VERSION = 'hexlands-shell-v1';
const SHELL = ['/', '/index.html', '/style.css', '/app.js', '/art.js', '/sound.js', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;   // fonts and anything off-site go straight to the network
  if (url.pathname.startsWith('/api/') || url.pathname === '/healthz') return;   // game traffic is never cached
  const page = req.mode === 'navigate';
  // Network first, so a new deploy shows up straight away; the cache is only the fallback when offline.
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(page ? '/index.html' : req, copy)); }
    return res;
  }).catch(() => caches.match(page ? '/index.html' : req, { ignoreSearch: true }).then(r => r || caches.match('/index.html'))));
});
