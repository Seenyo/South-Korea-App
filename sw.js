/* eslint-disable no-restricted-globals */

const CACHE_NAME = "sc-trip-map-cache-v2";
const RUNTIME_CACHE = "sc-trip-map-runtime-v2";

const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./config.js",
  "./manifest.webmanifest",
  "./data/places.json",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/maskable-512.png",
  "./assets/icons/apple-touch-icon.png",
];

const isSupabaseRequest = (url) => url.hostname.endsWith(".supabase.co");

const isGoogleRequest = (url) => {
  const h = url.hostname;
  return (
    h === "google.com" ||
    h.endsWith(".google.com") ||
    h === "gstatic.com" ||
    h.endsWith(".gstatic.com") ||
    h === "googleapis.com" ||
    h.endsWith(".googleapis.com")
  );
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(APP_SHELL.map((p) => new Request(p, { cache: "reload" })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== RUNTIME_CACHE).map(caches.delete));
      await self.clients.claim();
    })(),
  );
});

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.status === 200) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || fetchPromise || cached;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.status === 200) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Navigations: always try network, fall back to cached shell.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put("./index.html", response.clone());
          return response;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match("./index.html")) || (await cache.match("./"));
        }
      })(),
    );
    return;
  }

  // Same-origin: stale-while-revalidate for our app shell.
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, CACHE_NAME));
    return;
  }

  // Supabase is dynamic API data: never cache (prevents stale sync).
  if (isSupabaseRequest(url)) return;

  // Google Maps is dynamic/heavy: never cache.
  if (isGoogleRequest(url)) return;

  // Other cross-origin (fonts, CDN JS/CSS): cache-first.
  event.respondWith(cacheFirst(request, RUNTIME_CACHE));
});
