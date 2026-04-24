const SERVICE_WORKER_REVISION = '__PORTAL_SERVICE_WORKER_REVISION__'
const STATIC_CACHE = `provgroup-portal-static-${SERVICE_WORKER_REVISION}`
const APP_SHELL_URLS = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/pwa-icons/icon-192.png',
  '/pwa-icons/icon-512.png',
  '/pwa-icons/icon-maskable-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL_URLS)),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') {
    return
  }

  const requestUrl = new URL(request.url)

  if (requestUrl.origin !== self.location.origin) {
    return
  }

  if (requestUrl.pathname.startsWith('/api/')) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request))
    return
  }

  if (!shouldHandleStaticRequest(request)) {
    return
  }

  event.respondWith(handleStaticRequest(request))
})

function shouldHandleStaticRequest(request) {
  const requestUrl = new URL(request.url)

  if (APP_SHELL_URLS.includes(requestUrl.pathname)) {
    return true
  }

  return ['font', 'image', 'manifest', 'script', 'style', 'worker'].includes(
    request.destination,
  )
}

async function handleNavigationRequest(request) {
  const cache = await caches.open(STATIC_CACHE)

  try {
    const response = await fetch(request)

    if (shouldCacheResponse(response)) {
      await cache.put(request, response.clone())
    }

    return response
  } catch (error) {
    return (
      (await cache.match(request)) ||
      (await cache.match('/')) ||
      Response.error()
    )
  }
}

async function handleStaticRequest(request) {
  const cache = await caches.open(STATIC_CACHE)
  const cachedResponse = await cache.match(request)

  if (cachedResponse) {
    void updateCache(request, cache)
    return cachedResponse
  }

  return updateCache(request, cache)
}

async function updateCache(request, cache) {
  const response = await fetch(request)

  if (shouldCacheResponse(response)) {
    await cache.put(request, response.clone())
  }

  return response
}

function shouldCacheResponse(response) {
  if (!response.ok) {
    return false
  }

  const cacheControl =
    response.headers.get('cache-control')?.toLowerCase() ?? ''

  return !cacheControl.includes('no-store')
}
