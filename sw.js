const CACHE = 'pandalife-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll([
        './',
        './index.html',
        './css/style.css',
        './js/game.js',
        './manifest.json',
        './icons/icon.svg'
      ]).catch(() => {})
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate' && !e.request.url.match(/\.(css|js|json|svg)$/)) return;
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request))
  );
});
