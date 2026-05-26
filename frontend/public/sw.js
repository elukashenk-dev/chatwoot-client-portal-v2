const SERVICE_WORKER_REVISION = '__PORTAL_SERVICE_WORKER_REVISION__'
const STATIC_CACHE = `provgroup-portal-static-${SERVICE_WORKER_REVISION}`
const APP_SHELL_URLS = [
  '/',
  '/favicon.svg',
  '/pwa-icons/icon-192.png',
  '/pwa-icons/icon-512.png',
  '/pwa-icons/icon-maskable-512.png',
]
const PUSH_READY_CLIENT_IDS = new Set()

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
    return
  }

  const sourceClientId = event.source?.id

  if (!sourceClientId) {
    return
  }

  if (event.data?.type === 'PORTAL_PUSH_CLIENT_READY') {
    PUSH_READY_CLIENT_IDS.add(sourceClientId)
    return
  }

  if (event.data?.type === 'PORTAL_PUSH_CLIENT_NOT_READY') {
    PUSH_READY_CLIENT_IDS.delete(sourceClientId)
  }
})

self.addEventListener('push', (event) => {
  event.waitUntil(handlePushEvent(event))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(handleNotificationClick(event.notification.data))
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

  if (
    requestUrl.pathname.startsWith('/api/') ||
    isTenantDynamicMetadataRequest(requestUrl.pathname)
  ) {
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

  if (isTenantDynamicMetadataRequest(requestUrl.pathname)) {
    return false
  }

  if (APP_SHELL_URLS.includes(requestUrl.pathname)) {
    return true
  }

  return ['font', 'image', 'manifest', 'script', 'style', 'worker'].includes(
    request.destination,
  )
}

function isTenantDynamicMetadataRequest(pathname) {
  return (
    pathname === '/manifest.webmanifest' ||
    pathname === '/apple-touch-icon.png' ||
    pathname === '/api/tenant/manifest.webmanifest' ||
    pathname === '/api/tenant/apple-touch-icon.png' ||
    pathname.startsWith('/api/tenant/icons/')
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

async function handlePushEvent(event) {
  const payload = readPushPayload(event.data)
  const clientsList = await clients.matchAll({
    includeUncontrolled: false,
    type: 'window',
  })
  const focusedClient = clientsList.find(
    (client) =>
      client.focused &&
      isSameOriginUrl(client.url) &&
      PUSH_READY_CLIENT_IDS.has(client.id),
  )

  if (focusedClient) {
    focusedClient.postMessage({
      payload,
      type: 'PORTAL_PUSH_MESSAGE',
    })
    return
  }

  const notificationOptions = {
    body: 'Откройте портал, чтобы посмотреть чат.',
    data: {
      url: normalizeNotificationUrl(payload.url),
    },
    icon: '/pwa-icons/icon-192.png',
  }

  if (payload.notificationTag) {
    notificationOptions.tag = payload.notificationTag
  }

  await self.registration.showNotification(
    'Новое сообщение',
    notificationOptions,
  )
}

function readPushPayload(data) {
  if (!data) {
    return {
      notificationTag: null,
      tenantSlug: null,
      type: 'chat_message',
      url: '/',
    }
  }

  try {
    const payload = data.json()

    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid push payload.')
    }

    return {
      notificationTag:
        typeof payload.notificationTag === 'string' &&
        payload.notificationTag.length > 0
          ? payload.notificationTag
          : null,
      tenantSlug:
        typeof payload.tenantSlug === 'string' ? payload.tenantSlug : null,
      type: payload.type === 'chat_message' ? 'chat_message' : 'chat_message',
      url: normalizeNotificationUrl(
        typeof payload.url === 'string' ? payload.url : '/',
      ),
    }
  } catch {
    return {
      notificationTag: null,
      tenantSlug: null,
      type: 'chat_message',
      url: '/',
    }
  }
}

async function handleNotificationClick(data) {
  const url = normalizeNotificationUrl(data?.url)
  const clientsList = await clients.matchAll({
    includeUncontrolled: true,
    type: 'window',
  })
  const existingClient = clientsList.find((client) =>
    isSameOriginUrl(client.url),
  )

  if (existingClient) {
    await existingClient.focus()
    return
  }

  await clients.openWindow(url)
}

function normalizeNotificationUrl(value) {
  try {
    const url = new URL(value || '/', self.location.origin)

    if (url.origin !== self.location.origin) {
      return '/'
    }

    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/'
  }
}

function isSameOriginUrl(value) {
  try {
    return new URL(value).origin === self.location.origin
  } catch {
    return false
  }
}
