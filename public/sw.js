/**
 * 市场研究驾驶舱 Service Worker
 * 作用: 满足 PWA 可安装性, 并缓存带 hash 的静态构建产物加速二次打开。
 * 注意: /api 为实时行情数据, 永不缓存; 页面导航始终走网络, 避免发到旧版本。
 */
const STATIC_CACHE = "cockpit-static-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // 实时行情不缓存

  // Vite 构建产物(/assets)与图标带内容 hash, 可安全长缓存
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((resp) => {
            if (resp.ok) {
              const copy = resp.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
            }
            return resp;
          })
      )
    );
  }
});
