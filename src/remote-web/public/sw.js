const CACHE_NAME = 'multi-llm-remote-v1'
const SHELL_ASSETS = [
  '/',
  '/index.html',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip WebSocket requests
  if (url.protocol === 'wss:' || url.protocol === 'ws:') return

  // Network-first for navigation, cache-first for assets
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/index.html').then((cached) =>
          cached || new Response(
            '<html><body style="background:#0a0a0a;color:#999;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui"><p>Desktop non disponible. Verifiez votre connexion.</p></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          )
        )
      )
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  )
})
