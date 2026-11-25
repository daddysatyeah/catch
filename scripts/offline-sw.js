/* global REVISION, SHELL, SEMANTIC */
const cacheName = 'catch-shell-' + REVISION
const scope = new URL(self.registration.scope)
const home = new URL('index.html', scope)

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(SHELL.map(path => new URL(path, scope).href))).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('catch-shell-') && key !== cacheName).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('message', event => {
  if (event.data !== 'cache-semantic-runtime' || !event.ports[0]) return
  const port = event.ports[0]
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(cacheName)
      const missing = []
      for (const path of SEMANTIC) {
        const url = new URL(path, scope).href
        if (!(await cache.match(url))) missing.push(url)
      }
      if (missing.length) await cache.addAll(missing)
      port.postMessage(true)
    } catch { port.postMessage(false) }
  })())
})

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return
  const relative = url.pathname.slice(scope.pathname.length)
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(async () => (await caches.open(cacheName)).match(home)))
  } else if (relative.startsWith('assets/') || SHELL.includes(relative)) {
    event.respondWith((async () => {
      const cache = await caches.open(cacheName)
      const previous = await cache.match(event.request)
      if (previous) return previous
      const result = await fetch(event.request)
      if (result.ok) {
        try { await cache.put(event.request, result.clone()) } catch { /* Quota does not cancel a successful load. */ }
      }
      return result
    })())
  }
})
