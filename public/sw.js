// sw.js — Secure & Optimized Service Worker
// Created by ChatGPT 🔨🤖🔧
// Version: 1.0.0

const CACHE_NAME = "law-app-cache-v1"; // ⚡ cache version
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

// ✅ Install: pre-cache essential files
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        await cache.addAll(ASSETS_TO_CACHE);
        console.log("✅ Service Worker Installed & Cached Core Files");
      } catch (err) {
        console.error("❌ ক্যাশে যোগ করতে সমস্যা:", err);
      }
    })()
  );
  self.skipWaiting(); // activate immediately
});

// ✅ Activate: delete old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("🧹 Removing old cache:", key);
            return caches.delete(key);
          }
        })
      );
      console.log("🚀 Service Worker Activated");
    })()
  );
  self.clients.claim();
});

// ✅ Fetch: Network-first strategy (for dynamic freshness)
self.addEventListener("fetch", (event) => {
  const { request } = event;
  
  if (request.url.includes("firebaseio.com") || request.url.includes("gstatic.com") || request.url.includes("macros/s")) {
  return; // নেটওয়ার্ক রিকোয়েস্টকে সার্ভিস ওয়ার্কারের বাইরে যেতে দিন
}

  // 🧠 Only handle GET requests (ignore POST/PUT)
  if (request.method !== "GET") return;
  
   // 🚫 Ignore chrome-extension requests
  if (request.url.startsWith("chrome-extension://")) return;

  // 🧱 Never cache API calls (e.g. /api/visitor)
  if (request.url.includes("/api/visitor")) return;

  // 🧾 For data.json → network-first (get fresh data, else cache)
  if (request.url.endsWith("data.json")) {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, networkResponse.clone());
          console.log("📦 Updated cache for data.json");
          return networkResponse;
        } catch (err) {
          console.warn("⚠️ Network failed, using cached data.json");
          const cached = await caches.match(request);
          return cached || new Response("[]", {
            headers: { "Content-Type": "application/json" }
          });
        }
      })()
    );
    return;
  }

  // 🌐 For all other assets → cache-first fallback to network
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const networkResponse = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, networkResponse.clone());
        return networkResponse;
      } catch (err) {
        console.warn("❌ Offline & not cached:", request.url);
        // fallback offline response (optional custom HTML)
        if (request.destination === "document") {
          return new Response(
            `<h1>📴 Offline</h1><p>ইন্টারনেট সংযোগ নেই।</p>`,
            { headers: { "Content-Type": "text/html; charset=UTF-8" } }
          );
        }
      }
    })()
  );
});

// ✅ Message handler (optional manual update trigger)
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
