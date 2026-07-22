const CACHE = 'antelia-shell-v92';
const SHELL = ['./index.html', './manifest.json', './icon-192.png', './icon-512.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  // Only manage same-origin GET requests for the app shell; audio/image
  // requests to Drive pass straight through the network, untouched.
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((response) => {
        // Cache successful same-origin responses as they're fetched, so any
        // same-origin asset — not just the two files precached on install —
        // becomes available offline after its first successful load too.
        if (response && response.ok && response.type === 'basic'){
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return response;
      });
    })
  );
});
