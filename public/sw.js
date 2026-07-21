const SHELL_CACHE = "arcigy-kitchen-shell-v2";
const RUNTIME_CACHE = "arcigy-kitchen-runtime-v2";
const CORE_URLS = ["/", "/index.html", "/manifest.webmanifest", "/icons/app-icon-192.png", "/icons/app-icon-512.png"];

function isPrivateRuntimeRequest(url) {
  return url.pathname.startsWith("/api/") || url.pathname.startsWith("/storage/");
}

async function cacheResponse(cacheName, request, response) {
  if (!response.ok) return;
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  } catch {
    // Cache Storage is optional. Quota, eviction, or an interrupted response
    // must never reject the page request or create an unhandled promise.
  }
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
          continueInBackground(event, cacheResponse(SHELL_CACHE, "/", response));
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

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (!response.ok) return response;
        continueInBackground(event, cacheResponse(RUNTIME_CACHE, request, response));
        return response;
      })
      .catch(async () => {
        return (await caches.match(request)) || new Response("", { status: 503 });
      })
  );
});
