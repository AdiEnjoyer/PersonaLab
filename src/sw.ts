/// <reference lib="webworker" />
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { cacheNames } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkOnly } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<PrecacheEntry | string> };

const BASE = import.meta.env.BASE_URL;
const manifest = self.__WB_MANIFEST;

precacheAndRoute(manifest); // install fails as a whole when any entry fails (R1.8)
cleanupOutdatedCaches();

registerRoute(new NavigationRoute(createHandlerBoundToURL(`${BASE}index.html`), { allowlist: [new RegExp(`^${BASE}`)] })); // R12.10
registerRoute(
  ({ url }) => url.pathname.startsWith(`${BASE}exercises/img/`),
  new CacheFirst({ cacheName: 'exercise-images-v1', plugins: [new CacheableResponsePlugin({ statuses: [200] })] }), // no expiry (R13.6)
);
registerRoute(({ url }) => url.pathname === `${BASE}version.json`, new NetworkOnly());

async function allPrecached(): Promise<boolean> {
  const cache = await caches.open(cacheNames.precache);
  for (const entry of manifest) {
    const url = typeof entry === 'string' ? entry : entry.url;
    const href = new URL(url, self.registration.scope).href;
    const hit = (await cache.keys()).some((request) => request.url.split('?')[0] === href);
    if (!hit) return false;
  }
  return true;
}

// No skipWaiting() on install and no clientsClaim(): a new version waits for the Owner's "Reload" (R10.3).
self.addEventListener('message', (event) => {
  const data = event.data as { type?: string } | undefined;
  if (data?.type === 'SKIP_WAITING') void self.skipWaiting();
  if (data?.type === 'PRECACHE_STATUS') {
    event.waitUntil(allPrecached().then((ok) => event.ports[0]?.postMessage(ok)));
  }
});