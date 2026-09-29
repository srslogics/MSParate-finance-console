const SHELL_CACHE = "finance-shell-v20260929-8";
const STATIC_CACHE = "finance-static-v20260929-8";

const APP_SHELL = [
  "./",
  "./index.html",
  "./css/style.css?v=20260929-8",
  "./css/usability.css?v=20260929-8",
  "./js/api.js?v=20260929-8",
  "./js/app.js?v=20260929-8",
  "./js/usability.js?v=20260929-8",
  "./js/upload.js?v=20260929-8",
  "./js/dashboard.js?v=20260929-8",
  "./js/ledger.js?v=20260929-8",
  "./js/analytics.js?v=20260929-8",
  "./js/retail.js?v=20260929-8",
  "./js/daily-sheet.js?v=20260929-8",
  "./js/reports.js?v=20260929-8",
  "./assets/app-icon.svg?v=20260929-8",
  "./manifest.webmanifest?v=20260929-8"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => ![SHELL_CACHE, STATIC_CACHE].includes(key))
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

function isSameOrigin(requestUrl) {
  return new URL(requestUrl).origin === self.location.origin;
}

self.addEventListener("fetch", event => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (!isSameOrigin(request.url)) return;

  // Only public shell assets may be cached; never cache authenticated API data.
  const shellDocument = url.pathname === "/" || url.pathname === "/index.html";
  const publicAsset = ["/css/", "/js/", "/assets/"].some(prefix => url.pathname.startsWith(prefix))
    || url.pathname === "/manifest.webmanifest";
  if (!shellDocument && !publicAsset) return;

  const isHtmlRequest = shellDocument;
  if (isHtmlRequest) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then(cache => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (!response || response.status !== 200) return response;
        const copy = response.clone();
        caches.open(STATIC_CACHE).then(cache => cache.put(request, copy));
        return response;
      });
    })
  );
});
