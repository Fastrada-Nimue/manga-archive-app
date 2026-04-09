const CACHE_NAME = "manga-archive-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=20260409d",
  "./app.js?v=20260409d",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isDocument =
    event.request.mode === "navigate" ||
    event.request.destination === "document";
  const isAppShellAsset =
    isSameOrigin &&
    (requestUrl.pathname.endsWith("/app.js") ||
      requestUrl.pathname.endsWith("/styles.css") ||
      requestUrl.pathname.endsWith("/index.html"));

  // For app shell assets, prefer network to avoid stale behavior after deploys.
  if (isAppShellAsset) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          return caches.match("./index.html");
        }),
    );
    return;
  }

  // For top-level pages, prefer network so installed app stays fresh online.
  if (isSameOrigin && isDocument) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          return cached || caches.match("./index.html");
        }),
    );
    return;
  }

  // For other files, use stale-while-revalidate so cached assets are served
  // immediately but the cache is always refreshed in the background.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);

      // Always kick off a background fetch to keep assets fresh.
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => null);

      if (cached) return cached; // serve stale immediately; cache updates in background

      const fresh = await networkFetch;
      if (fresh) return fresh;

      if (isSameOrigin && event.request.destination === "image") {
        return caches.match("./assets/icon-192.png");
      }
      return new Response("", { status: 504, statusText: "Gateway Timeout" });
    }),
  );
});
