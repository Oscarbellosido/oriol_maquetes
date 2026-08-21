const CACHE = 'maquetes-v1';
const FILES = [
  '/oriol_maquetes/',
  '/oriol_maquetes/index.html',
  '/oriol_maquetes/images/car-logo.png',
  '/oriol_maquetes/images/icon-192.png',
  '/oriol_maquetes/images/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

// Network first — sempre versió nova, cache com a fallback
self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request)
      .then(r => {
        const clone = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
