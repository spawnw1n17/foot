const CACHE = 'neon-dominion-v6';
const FILES = [
  './', './index.html', './styles.css', './styles-v2.css', './styles-v4.css', './styles-v5.css', './styles-v6.css', './styles-v6-home.css', './manifest.webmanifest',
  './assets/icon.svg', './assets/arena-background.svg', './assets/base-core.svg', './assets/base-factory.svg',
  './assets/base-fortress.svg', './assets/base-relay.svg', './assets/base-reactor.svg',
  './src/maps.js', './src/engine.js', './src/territory.js', './src/meta.js', './src/game.js', './src/home-profile.js',
];
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match('./index.html'))));
});
