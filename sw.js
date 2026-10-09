"use strict";

const CACHE_NAME = "risk-game-cache-v5";

const APP_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith("risk-game-cache-") && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 다른 사이트의 요청은 가로채지 않음
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request, { cache: "no-cache" })
      .then(response => {
        if (response && response.ok && response.type === "basic") {
          const copy = response.clone();

          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, copy).catch(() => {});
          });
        }

        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: true });

        if (cached) return cached;

        if (request.mode === "navigate") {
          const fallback = await caches.match("./index.html");
          if (fallback) return fallback;
        }

        return new Response("오프라인 상태입니다. 인터넷 연결 후 다시 시도해 주세요.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      })
  );
});