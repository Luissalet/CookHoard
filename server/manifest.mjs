// Web app manifest plus a minimal service worker: makes the app installable. The worker only caches built /assets/ files
// (cache-first); every /api/ and /media/ request goes to the network and is never cached. No offline page.
import { version } from './version.mjs';

export function manifest() {
  return {
    name: 'CookHoard', short_name: 'CookHoard', description: 'Cocina de casa: recetas, despensa, tickets, menú y compra.',
    start_url: '/', scope: '/', display: 'standalone', background_color: '#15130f', theme_color: '#15130f', lang: 'es',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  };
}

export function serviceWorker() {
  const cacheName = `cookhoard-assets-v${version}`;
  return `// Minimal service worker: installability plus cache-first for built /assets/ files only.
const CACHE_NAME = ${JSON.stringify(cacheName)};
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith('/assets/')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok) cache.put(event.request, response.clone());
    return response;
  })());
});
`;
}
