// Service Worker — PWA 离线支持
// 策略：app shell 预缓存 + 静态资源 stale-while-revalidate + API network-first + CDN cache-first
// 首次加载后断网仍可访问所有已缓存页面，向量模型/WASM 也被缓存供离线推理
const CACHE_VERSION = 'cs-v2'
const SHELL_CACHE = `shell-${CACHE_VERSION}`
const ASSET_CACHE = `assets-${CACHE_VERSION}`
const CDN_CACHE = `cdn-${CACHE_VERSION}`

// 预缓存 app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(['./', './index.html'])),
  )
  self.skipWaiting()
})

// 清理旧版本缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.endsWith(CACHE_VERSION))
          .map((k) => caches.delete(k)),
      ),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  const isSameOrigin = url.origin === self.location.origin
  const isCDN =
    url.hostname.includes('huggingface.co') ||
    url.hostname.includes('jsdelivr.net') ||
    url.hostname.includes('cdn.jsdelivr.net')

  // 非同源且非 CDN：不拦截（如 LLM API 流式请求由主线程处理）
  if (!isSameOrigin && !isCDN) return

  // API 调用：network-first（需要最新数据，离线时回退缓存）
  if (isSameOrigin && url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone()
            caches.open(ASSET_CACHE).then((c) => c.put(req, clone))
          }
          return res
        })
        .catch(() => caches.match(req)),
    )
    return
  }

  // CDN 资源（向量模型、WASM）：cache-first（大文件、不可变）
  if (isCDN) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached
        return fetch(req).then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone()
            caches.open(CDN_CACHE).then((c) => c.put(req, clone))
          }
          return res
        })
      }),
    )
    return
  }

  // HTML 文档：network-first（确保总是加载最新版本，避免白屏）
  if (isSameOrigin && (req.destination === 'document' || url.pathname.endsWith('.html') || url.pathname === '/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone()
            caches.open(SHELL_CACHE).then((c) => c.put(req, clone))
          }
          return res
        })
        .catch(() => caches.match(req).then((c) => c || caches.match('./index.html'))),
    )
    return
  }

  // 同源静态资源（JS/CSS/字体/图片）：stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone()
            caches.open(ASSET_CACHE).then((c) => c.put(req, clone))
          }
          return res
        })
        .catch(() => cached)
      return cached || fetchPromise
    }),
  )
})

// 允许页面主动触发更新
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting()
})
