const SHELL_CACHE = "arcigy-kitchen-shell-v3";
const RUNTIME_CACHE = "arcigy-kitchen-runtime-v3";
const CORE_URLS = ["/", "/index.html", "/manifest.webmanifest", "/icons/app-icon-192.png", "/icons/app-icon-512.png"];
const RUNTIME_CACHE_MAX_ENTRIES = 150;
const HASHED_ASSET_PATTERN = /(?:^|[-.])[a-z0-9_-]{8,}\.(?:css|js|mjs|png|jpe?g|webp|avif|svg|woff2?|wasm)$/i;
const MEDIA_ASSET_PATTERN = /\.(?:png|jpe?g|webp|avif|gif|svg|ktx2?|hdr|exr|woff2?)(?:$|\?)/i;

function isPrivateRuntimeRequest(url) {
  return url.pathname.startsWith("/api/")
    || url.pathname.startsWith("/storage/")
    || url.pathname.startsWith("/exports/")
    || url.pathname.startsWith("/auth/");
}

function isPublicMediaRequest(url) {
  return url.pathname.startsWith("/materials/")
    || url.pathname.startsWith("/icons/")
    || url.pathname.startsWith("/assets/")
    || url.pathname === "/organization/default-user.svg";
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - maxEntries)).map((request) => cache.delete(request)));
}

async function cacheResponse(cacheName, request, response, maxEntries = RUNTIME_CACHE_MAX_ENTRIES) {
  if (!response.ok) return;
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
    await trimCache(cacheName, maxEntries);
  } catch {
    // Cache Storage is optional. Quota, eviction, or an interrupted response
    // must never reject the page request or create an unhandled promise.
  }
}

async function cacheFirst(event, request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  continueInBackground(event, cacheResponse(RUNTIME_CACHE, request, response));
  return response;
}

async function staleWhileRevalidate(event, request) {
  const cached = await caches.match(request);
  const network = fetch(request).then((response) => {
    continueInBackground(event, cacheResponse(RUNTIME_CACHE, request, response));
    return response;
  });
  if (cached) {
    continueInBackground(event, network.catch(() => undefined));
    return cached;
  }
  return network;
}

function continueInBackground(event, promise) {
  try {
    event.waitUntil(promise);
  } catch {
    // A late cache extension can be rejected after the fetch event has already
    // settled. The network response must still be returned to the application.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(CORE_URLS.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          continueInBackground(event, cacheResponse(SHELL_CACHE, "/", response, CORE_URLS.length + 2));
          return response;
        })
        .catch(async () => {
          return (await caches.match(request)) || (await caches.match("/")) || (await caches.match("/index.html")) || new Response("", { status: 503 });
        })
    );
    return;
  }

  // Authenticated API and project-storage responses must never be persisted in
  // a browser cache shared by consecutive Arcigy users.
  if (isPrivateRuntimeRequest(url)) return;

  if (HASHED_ASSET_PATTERN.test(url.pathname)) {
    event.respondWith(cacheFirst(event, request).catch(() => new Response("", { status: 503 })));
    return;
  }

  if (isPublicMediaRequest(url) && (request.destination === "image" || request.destination === "font" || MEDIA_ASSET_PATTERN.test(url.pathname))) {
    event.respondWith(staleWhileRevalidate(event, request).catch(async () => {
      return (await caches.match(request)) || new Response("", { status: 503 });
    }));
  }
});
