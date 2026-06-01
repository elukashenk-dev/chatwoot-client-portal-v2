const SERVICE_WORKER_REVISION = '__PORTAL_SERVICE_WORKER_REVISION__'
const STATIC_CACHE = `provgroup-portal-static-${SERVICE_WORKER_REVISION}`
const PUSH_CLIENT_RESPONSE_TIMEOUT_MS = 700
const APP_BADGE_DATABASE_NAME = 'provgroup-portal-app-badge'
const APP_BADGE_STORE_NAME = 'state'
const APP_BADGE_COUNT_KEY = 'chat_push_count'
const APP_BADGE_MAX_COUNT = 9999
const PORTAL_OFFLINE_DATABASE_NAME = 'portal-offline'
const PORTAL_OFFLINE_DATABASE_VERSION = 2
const PORTAL_OFFLINE_MESSAGE_SNAPSHOT_LIMIT = 50
const TEXT_OUTBOX_BACKGROUND_SYNC_TAG = 'portal-text-outbox-drain'
const TEXT_OUTBOX_SEND_LEASE_MS = 30_000
const TEXT_OUTBOX_DRAIN_LEASE_MS = 30_000
const TEXT_OUTBOX_SEND_IN_PROGRESS_RETRY_MS = 5_000
const TEXT_OUTBOX_GENERIC_SEND_ERROR_MESSAGE = 'Не удалось отправить сообщение.'
const PORTAL_OFFLINE_STORES = [
  'tenant_contexts',
  'last_active_identities',
  'local_device_signouts',
  'auth_snapshots',
  'chat_thread_lists',
  'chat_message_snapshots',
  'chat_message_pages',
  'chat_text_outbox',
  'sync_leases',
  'push_stale_markers',
]
const BUILD_ASSET_URLS = parseBuildAssetUrls(
  '__PORTAL_SERVICE_WORKER_ASSETS_JSON__',
)
const APP_SHELL_URLS = [
  '/',
  '/default-branding/auth-header.png',
  '/default-branding/auth-footer.png',
  '/favicon.svg',
  '/pwa-icons/icon-192.png',
  '/pwa-icons/icon-512.png',
  '/pwa-icons/icon-maskable-512.png',
  ...BUILD_ASSET_URLS,
]
const PUSH_READY_CLIENT_IDS = new Set()
const PUSH_READY_CLIENT_THREAD_IDS = new Map()
let appBadgeMutationQueue = Promise.resolve()

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

  if (event.data?.type === 'PORTAL_SERVICE_WORKER_STATUS') {
    const replyTarget = event.ports?.[0] ?? event.source

    replyTarget?.postMessage({
      assetCount: APP_SHELL_URLS.length,
      revision: SERVICE_WORKER_REVISION,
      type: 'PORTAL_SERVICE_WORKER_STATUS_RESULT',
    })
    return
  }

  if (event.data?.type === 'PORTAL_APP_BADGE_CLEAR') {
    const resetPromise = resetAppIconBadge()
    event.waitUntil?.(resetPromise)
    return
  }

  if (event.data?.type === 'PORTAL_APP_BADGE_SET') {
    const badgeCount = Number.isSafeInteger(event.data.count)
      ? event.data.count
      : 0
    const setPromise = setExactAppIconBadge(badgeCount)
    event.waitUntil?.(setPromise)
    return
  }

  if (event.data?.type === 'PORTAL_CHAT_THREAD_NOTIFICATIONS_CLEAR') {
    const threadId =
      typeof event.data.threadId === 'string' && event.data.threadId.length > 0
        ? event.data.threadId
        : null

    if (!threadId) {
      return
    }

    const clearPromise = closePortalChatNotificationsForThread(threadId)
    event.waitUntil?.(clearPromise)
    return
  }

  const sourceClientId = event.source?.id

  if (!sourceClientId) {
    return
  }

  if (event.data?.type === 'PORTAL_PUSH_CLIENT_READY') {
    PUSH_READY_CLIENT_IDS.add(sourceClientId)
    PUSH_READY_CLIENT_THREAD_IDS.set(
      sourceClientId,
      typeof event.data.activeThreadId === 'string' &&
        event.data.activeThreadId.length > 0
        ? event.data.activeThreadId
        : null,
    )
    return
  }

  if (event.data?.type === 'PORTAL_PUSH_CLIENT_NOT_READY') {
    PUSH_READY_CLIENT_IDS.delete(sourceClientId)
    PUSH_READY_CLIENT_THREAD_IDS.delete(sourceClientId)
  }
})

self.addEventListener('push', (event) => {
  event.waitUntil(handlePushEvent(event))
})

self.addEventListener('sync', (event) => {
  if (event.tag !== TEXT_OUTBOX_BACKGROUND_SYNC_TAG) {
    return
  }

  event.waitUntil(drainTextOutboxInBackgroundSync())
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

function parseBuildAssetUrls(rawValue) {
  try {
    const parsed = JSON.parse(rawValue)

    return Array.isArray(parsed)
      ? parsed.filter((value) => typeof value === 'string')
      : []
  } catch {
    return []
  }
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
  const cachedResponse =
    (await cache.match(request)) || (await cache.match('/'))

  if (cachedResponse) {
    void refreshNavigationCache(request, cache)

    return cachedResponse
  }

  try {
    return await fetchAndCacheNavigationRequest(request, cache)
  } catch (error) {
    return Response.error()
  }
}

async function refreshNavigationCache(request, cache) {
  try {
    await fetchAndCacheNavigationRequest(request, cache)
  } catch {
    // Cached app shell has already been served; refresh is best-effort.
  }
}

async function fetchAndCacheNavigationRequest(request, cache) {
  const response = await fetch(request)

  if (shouldCacheResponse(response)) {
    await cache.put(request, response.clone())
  }

  return response
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

async function drainTextOutboxInBackgroundSync() {
  if (await hasVisiblePortalClient()) {
    return
  }

  const host = getServiceWorkerHost()

  if (!host) {
    return
  }

  const identity = await readLastActiveIdentityForHost(host)

  if (!identity || (await hasLocalDeviceSignout(host, identity))) {
    return
  }

  await withTextOutboxDrainLock(identity, () =>
    drainTextOutboxForIdentity(identity),
  )
}

async function hasVisiblePortalClient() {
  try {
    const clientsList = await clients.matchAll({
      includeUncontrolled: false,
      type: 'window',
    })

    return clientsList.some(
      (client) =>
        client.visibilityState === 'visible' && isSameOriginUrl(client.url),
    )
  } catch {
    return false
  }
}

function getServiceWorkerHost() {
  try {
    return new URL(self.location.origin).host
  } catch {
    return null
  }
}

async function readLastActiveIdentityForHost(host) {
  const record = await readPortalOfflineRecord('last_active_identities', host)

  return isLastActiveIdentityRecord(record) && record.host === host
    ? record
    : null
}

async function hasLocalDeviceSignout(host, identity) {
  const record = await readPortalOfflineRecord('local_device_signouts', host)

  return (
    isLocalDeviceSignoutRecord(record) &&
    record.host === host &&
    record.tenantSlug === identity.tenantSlug &&
    record.userId === identity.userId
  )
}

async function drainTextOutboxForIdentity(identity) {
  const dueRecords = await listDueTextOutboxRecords(identity, new Date())

  for (const record of dueRecords) {
    const attemptAt = new Date()
    const ownerId = createTextOutboxOwnerId()
    const sendingRecord = await markTextOutboxSending(
      record,
      ownerId,
      attemptAt,
    )

    try {
      const sendResult = await sendBackgroundTextMessage(sendingRecord)

      if (isSendResultForTextOutboxRecord(sendResult, sendingRecord)) {
        try {
          await deleteTextOutboxRecord(sendingRecord)
        } catch {
          // Backend accepted the message; local cleanup is best-effort.
        }

        try {
          await saveSentMessageSnapshotFromBackgroundSend(
            identity,
            sendingRecord,
            sendResult,
          )
        } catch {
          // Cached transcript refresh is best-effort after a successful send.
        }
        continue
      }

      await markTextOutboxQueued(
        sendingRecord,
        null,
        TEXT_OUTBOX_GENERIC_SEND_ERROR_MESSAGE,
        new Date(),
      )
    } catch (error) {
      const apiError = getBackgroundSendErrorDetails(error)

      if (apiError.statusCode === 401) {
        await markTextOutboxQueued(
          sendingRecord,
          null,
          apiError.message,
          new Date(),
        )
        return
      }

      if (
        apiError.statusCode === 403 ||
        apiError.code === 'thread_access_denied'
      ) {
        await markTextOutboxFailed(
          sendingRecord,
          apiError.code,
          apiError.message,
          new Date(),
        )
        continue
      }

      if (apiError.statusCode === 409) {
        if (apiError.code === 'chat_send_in_progress') {
          await markTextOutboxQueued(
            sendingRecord,
            new Date(
              Date.now() + TEXT_OUTBOX_SEND_IN_PROGRESS_RETRY_MS,
            ).toISOString(),
            apiError.message,
            new Date(),
          )
          continue
        }

        if (apiError.code === 'client_message_key_conflict') {
          await markTextOutboxFailed(
            sendingRecord,
            apiError.code,
            apiError.message,
            new Date(),
          )
          continue
        }
      }

      if (apiError.statusCode === 429) {
        await markTextOutboxQueued(
          sendingRecord,
          addRetryAfter(new Date(), apiError.retryAfterSeconds) ??
            addTextOutboxBackoff(new Date(), sendingRecord.attemptCount),
          apiError.message,
          new Date(),
        )
        continue
      }

      await markTextOutboxQueued(
        sendingRecord,
        addTextOutboxBackoff(new Date(), sendingRecord.attemptCount),
        apiError.message,
        new Date(),
      )
    }
  }
}

async function sendBackgroundTextMessage(record) {
  const body = {
    clientMessageKey: record.clientMessageKey,
    content: record.content,
    threadId: record.threadId,
  }

  if (typeof record.replyToMessageId === 'number') {
    body.replyToMessageId = record.replyToMessageId
  }

  let response

  try {
    response = await fetch('/api/chat/messages', {
      body: JSON.stringify(body),
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
  } catch {
    throw {
      code: null,
      message: TEXT_OUTBOX_GENERIC_SEND_ERROR_MESSAGE,
      retryAfterSeconds: null,
      statusCode: 0,
    }
  }

  const payload = await readJsonResponseBody(response)

  if (!response.ok) {
    const errorPayload = isObject(payload) ? payload.error : null

    throw {
      code:
        isObject(errorPayload) && typeof errorPayload.code === 'string'
          ? errorPayload.code
          : null,
      message:
        isObject(errorPayload) && typeof errorPayload.message === 'string'
          ? errorPayload.message
          : TEXT_OUTBOX_GENERIC_SEND_ERROR_MESSAGE,
      retryAfterSeconds: parseRetryAfterSeconds(response),
      statusCode: response.status,
    }
  }

  return payload
}

function getBackgroundSendErrorDetails(error) {
  return {
    code: isObject(error) && typeof error.code === 'string' ? error.code : null,
    message:
      isObject(error) && typeof error.message === 'string'
        ? error.message
        : TEXT_OUTBOX_GENERIC_SEND_ERROR_MESSAGE,
    retryAfterSeconds:
      isObject(error) && typeof error.retryAfterSeconds === 'number'
        ? error.retryAfterSeconds
        : null,
    statusCode:
      isObject(error) && typeof error.statusCode === 'number'
        ? error.statusCode
        : 0,
  }
}

async function readJsonResponseBody(response) {
  const contentType = response.headers.get('content-type')

  if (!contentType?.includes('application/json')) {
    return null
  }

  try {
    return await response.json()
  } catch {
    return null
  }
}

function parseRetryAfterSeconds(response) {
  const retryAfter = response.headers.get('Retry-After')

  if (!retryAfter) {
    return null
  }

  const seconds = Number(retryAfter)

  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.ceil(seconds)
  }

  const retryAtMs = Date.parse(retryAfter)

  if (!Number.isFinite(retryAtMs)) {
    return null
  }

  const delaySeconds = Math.ceil((retryAtMs - Date.now()) / 1000)

  return delaySeconds > 0 ? delaySeconds : null
}

function addTextOutboxBackoff(now, attemptCount) {
  const delayMs = Math.min(60_000, 1000 * 2 ** Math.max(0, attemptCount - 1))

  return new Date(now.getTime() + delayMs).toISOString()
}

function addRetryAfter(now, retryAfterSeconds) {
  if (
    typeof retryAfterSeconds === 'number' &&
    Number.isFinite(retryAfterSeconds) &&
    retryAfterSeconds > 0
  ) {
    return new Date(now.getTime() + retryAfterSeconds * 1000).toISOString()
  }

  return null
}

async function listDueTextOutboxRecords(identity, now) {
  const records = await listPortalOfflineRecords('chat_text_outbox')
  const nowMs = now.getTime()

  return records
    .filter(isTextOutboxRecord)
    .filter(
      (record) =>
        record.tenantSlug === identity.tenantSlug &&
        record.userId === identity.userId &&
        (record.status === 'queued' || record.status === 'sending'),
    )
    .filter((record) => {
      if (record.status === 'queued') {
        return (
          !record.nextAttemptAt ||
          isPastOrInvalidTimestamp(record.nextAttemptAt, nowMs)
        )
      }

      return (
        record.sendingLeaseExpiresAt !== null &&
        isPastOrInvalidTimestamp(record.sendingLeaseExpiresAt, nowMs)
      )
    })
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

function isSendResultForTextOutboxRecord(result, record) {
  return (
    isObject(result) &&
    result.result === 'ready' &&
    isObject(result.activeThread) &&
    result.activeThread.id === record.threadId &&
    isObject(result.sentMessage) &&
    result.sentMessage.clientMessageKey === record.clientMessageKey
  )
}

async function markTextOutboxSending(record, ownerId, now) {
  const nextRecord = {
    ...record,
    attemptCount: record.attemptCount + 1,
    errorCode: null,
    errorMessage: null,
    lastAttemptAt: now.toISOString(),
    nextAttemptAt: null,
    sendOwnerId: ownerId,
    sendingLeaseExpiresAt: new Date(
      now.getTime() + TEXT_OUTBOX_SEND_LEASE_MS,
    ).toISOString(),
    sendingStartedAt: now.toISOString(),
    status: 'sending',
    updatedAt: now.toISOString(),
  }

  await putPortalOfflineRecord(
    'chat_text_outbox',
    textOutboxKey(record),
    nextRecord,
  )

  return nextRecord
}

function markTextOutboxQueued(record, nextAttemptAt, errorMessage, now) {
  return putPortalOfflineRecord('chat_text_outbox', textOutboxKey(record), {
    ...record,
    errorCode: null,
    errorMessage,
    nextAttemptAt,
    sendOwnerId: null,
    sendingLeaseExpiresAt: null,
    sendingStartedAt: null,
    status: 'queued',
    updatedAt: now.toISOString(),
  })
}

function markTextOutboxFailed(record, errorCode, errorMessage, now) {
  return putPortalOfflineRecord('chat_text_outbox', textOutboxKey(record), {
    ...record,
    errorCode,
    errorMessage,
    nextAttemptAt: null,
    sendOwnerId: null,
    sendingLeaseExpiresAt: null,
    sendingStartedAt: null,
    status: 'failed',
    updatedAt: now.toISOString(),
  })
}

function deleteTextOutboxRecord(record) {
  return deletePortalOfflineRecord('chat_text_outbox', textOutboxKey(record))
}

async function saveSentMessageSnapshotFromBackgroundSend(
  identity,
  record,
  sendResult,
) {
  if (!isObject(sendResult.sentMessage)) {
    return
  }

  const key = scopedThreadKey(
    identity.tenantSlug,
    identity.userId,
    record.threadId,
  )
  const current = await readPortalOfflineRecord('chat_message_snapshots', key)
  const currentSnapshot = isMessageSnapshotRecord(current)
    ? current.snapshot
    : null
  const sentMessage = sendResult.sentMessage
  const messages = (currentSnapshot?.messages ?? []).filter(
    (message) =>
      message.id !== sentMessage.id &&
      (!sentMessage.clientMessageKey ||
        message.clientMessageKey !== sentMessage.clientMessageKey),
  )

  messages.push(sentMessage)

  await putPortalOfflineRecord('chat_message_snapshots', key, {
    savedAt: new Date().toISOString(),
    snapshot: {
      activeThread: sendResult.activeThread,
      hasMoreOlder: currentSnapshot?.hasMoreOlder ?? false,
      messages: sortMessagesByTimeline(messages).slice(
        -PORTAL_OFFLINE_MESSAGE_SNAPSHOT_LIMIT,
      ),
      nextOlderCursor: currentSnapshot?.nextOlderCursor ?? null,
      reason: sendResult.reason,
      result: sendResult.result,
    },
    tenantSlug: identity.tenantSlug,
    threadId: record.threadId,
    userId: identity.userId,
  })
}

function sortMessagesByTimeline(messages) {
  return [...messages].sort((left, right) => {
    const leftTime = new Date(left.createdAt).getTime()
    const rightTime = new Date(right.createdAt).getTime()

    if (leftTime !== rightTime) {
      return leftTime - rightTime
    }

    return left.id - right.id
  })
}

async function withTextOutboxDrainLock(identity, operation) {
  const lockName = `portal-outbox:${identity.tenantSlug}:${identity.userId}`

  if (navigator?.locks?.request) {
    return navigator.locks.request(lockName, operation)
  }

  const ownerId = createTextOutboxOwnerId()
  const acquired = await tryAcquireTextOutboxDrainLease(identity, ownerId)

  if (!acquired) {
    return null
  }

  try {
    return await operation()
  } finally {
    await releaseTextOutboxDrainLease(identity, ownerId)
  }
}

function tryAcquireTextOutboxDrainLease(identity, ownerId) {
  return mutateTextOutboxDrainLease(
    identity,
    async ({ key, store, transaction }) => {
      const current = await idbRequestToPromise(store.get(key))
      const currentExpiresAt = current
        ? new Date(current.expiresAt).getTime()
        : 0
      const currentExpired =
        !Number.isFinite(currentExpiresAt) || currentExpiresAt <= Date.now()

      if (current && !currentExpired) {
        await idbTransactionDone(transaction)
        return false
      }

      await idbRequestToPromise(
        store.put(
          {
            expiresAt: new Date(
              Date.now() + TEXT_OUTBOX_DRAIN_LEASE_MS,
            ).toISOString(),
            ownerId,
          },
          key,
        ),
      )
      await idbTransactionDone(transaction)
      return true
    },
  )
}

function releaseTextOutboxDrainLease(identity, ownerId) {
  return mutateTextOutboxDrainLease(
    identity,
    async ({ key, store, transaction }) => {
      const current = await idbRequestToPromise(store.get(key))

      if (current?.ownerId === ownerId) {
        await idbRequestToPromise(store.delete(key))
      }

      await idbTransactionDone(transaction)
    },
  )
}

async function mutateTextOutboxDrainLease(identity, operation) {
  const database = await openPortalOfflineDatabase()
  const transaction = database.transaction('sync_leases', 'readwrite')
  const store = transaction.objectStore('sync_leases')

  try {
    return await operation({
      key: `portal-outbox:${identity.tenantSlug}:${identity.userId}`,
      store,
      transaction,
    })
  } finally {
    database.close()
  }
}

function listPortalOfflineRecords(storeName) {
  return withPortalOfflineStore(storeName, 'readonly', async (store) =>
    idbRequestToPromise(store.getAll()),
  )
}

function readPortalOfflineRecord(storeName, key) {
  return withPortalOfflineStore(storeName, 'readonly', async (store) =>
    idbRequestToPromise(store.get(key)),
  )
}

function putPortalOfflineRecord(storeName, key, value) {
  return withPortalOfflineStore(storeName, 'readwrite', async (store) => {
    await idbRequestToPromise(store.put(value, key))
  })
}

function deletePortalOfflineRecord(storeName, key) {
  return withPortalOfflineStore(storeName, 'readwrite', async (store) => {
    await idbRequestToPromise(store.delete(key))
  })
}

async function withPortalOfflineStore(storeName, mode, operation) {
  const database = await openPortalOfflineDatabase()
  const transaction = database.transaction(storeName, mode)
  const store = transaction.objectStore(storeName)

  try {
    const result = await operation(store)

    await idbTransactionDone(transaction)

    return result
  } finally {
    database.close()
  }
}

function idbRequestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB request failed.'))
    }
  })
}

function idbTransactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve()
    }
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
    }
    transaction.onabort = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction aborted.'))
    }
  })
}

function isTextOutboxRecord(value) {
  return (
    isObject(value) &&
    Number.isFinite(value.attemptCount) &&
    typeof value.clientMessageKey === 'string' &&
    typeof value.content === 'string' &&
    typeof value.createdAt === 'string' &&
    isNullableString(value.errorCode) &&
    isNullableString(value.errorMessage) &&
    isNullableString(value.lastAttemptAt) &&
    isNullableString(value.nextAttemptAt) &&
    (value.replyTo === null || isObject(value.replyTo)) &&
    isNullableNumber(value.replyToMessageId) &&
    isNullableString(value.sendOwnerId) &&
    isNullableString(value.sendingLeaseExpiresAt) &&
    isNullableString(value.sendingStartedAt) &&
    (value.status === 'failed' ||
      value.status === 'queued' ||
      value.status === 'sending') &&
    typeof value.tenantSlug === 'string' &&
    typeof value.threadId === 'string' &&
    typeof value.updatedAt === 'string' &&
    Number.isFinite(value.userId)
  )
}

function isLastActiveIdentityRecord(value) {
  return (
    isObject(value) &&
    typeof value.host === 'string' &&
    typeof value.savedAt === 'string' &&
    typeof value.tenantSlug === 'string' &&
    Number.isFinite(value.userId)
  )
}

function isLocalDeviceSignoutRecord(value) {
  return (
    isObject(value) &&
    typeof value.createdAt === 'string' &&
    typeof value.host === 'string' &&
    typeof value.tenantSlug === 'string' &&
    Number.isFinite(value.userId)
  )
}

function isMessageSnapshotRecord(value) {
  return (
    isObject(value) &&
    typeof value.savedAt === 'string' &&
    isObject(value.snapshot) &&
    Array.isArray(value.snapshot.messages) &&
    typeof value.tenantSlug === 'string' &&
    typeof value.threadId === 'string' &&
    Number.isFinite(value.userId)
  )
}

function isNullableString(value) {
  return value === null || typeof value === 'string'
}

function isNullableNumber(value) {
  return value === null || Number.isFinite(value)
}

function isPastOrInvalidTimestamp(value, nowMs) {
  const valueMs = new Date(value).getTime()

  return !Number.isFinite(valueMs) || valueMs <= nowMs
}

function textOutboxKey(record) {
  return `${record.tenantSlug}:${record.userId}:${record.threadId}:${record.clientMessageKey}`
}

function scopedThreadKey(tenantSlug, userId, threadId) {
  return `${tenantSlug}:${userId}:${threadId}`
}

function createTextOutboxOwnerId() {
  if (self.crypto?.randomUUID) {
    return self.crypto.randomUUID()
  }

  return `portal-outbox-owner:${Date.now()}:${Math.random().toString(36).slice(2)}`
}

function isObject(value) {
  return typeof value === 'object' && value !== null
}

function isPushReadyForThread(client, threadId) {
  return (
    threadId !== null &&
    PUSH_READY_CLIENT_IDS.has(client.id) &&
    PUSH_READY_CLIENT_THREAD_IDS.get(client.id) === threadId
  )
}

async function handlePushEvent(event) {
  const payload = readPushPayload(event.data)
  const clientsList = await clients.matchAll({
    includeUncontrolled: false,
    type: 'window',
  })

  if (await notifyPortalClients({ clientsList, payload })) {
    return
  }

  const staleMarkerPersistence = persistPushStaleMarkerBestEffort(payload)
  const notificationCopy = buildNotificationCopy(payload)
  const notificationOptions = {
    body: notificationCopy.body,
    data: {
      threadId: payload.threadId,
      url: normalizeNotificationUrl(payload.url),
    },
    icon: '/pwa-icons/icon-192.png',
  }

  if (payload.notificationTag) {
    notificationOptions.tag = payload.notificationTag
    notificationOptions.timestamp = Date.now()
  }

  if (payload.soundEnabled === false) {
    notificationOptions.silent = true
  }

  await self.registration.showNotification(
    notificationCopy.title,
    notificationOptions,
  )
  await setExactAppIconBadge(payload.totalUnreadCount)
  await staleMarkerPersistence
}

async function setExactAppIconBadge(count) {
  if (
    typeof count !== 'number' ||
    !Number.isFinite(count) ||
    count < 0 ||
    typeof navigator === 'undefined'
  ) {
    return
  }

  try {
    await runAppBadgeMutation(async () => {
      const badgeCount = Math.min(Math.floor(count), APP_BADGE_MAX_COUNT)

      try {
        await writePersistedAppBadgeCount(badgeCount)
      } catch {
        // Platform badge support is still useful when fallback storage is unavailable.
      }

      if (badgeCount > 0 && typeof navigator.setAppBadge === 'function') {
        await navigator.setAppBadge(badgeCount)
        return
      }

      if (badgeCount === 0 && typeof navigator.clearAppBadge === 'function') {
        await navigator.clearAppBadge()
      }
    })
  } catch {
    // App badge support and permission behavior differs by browser/platform.
  }
}

async function resetAppIconBadge() {
  // Clear both the platform badge and the persisted fallback count. Some mobile
  // launchers keep the badge set by service worker push until the worker clears it.
  await runAppBadgeMutation(async () => {
    try {
      await writePersistedAppBadgeCount(0)
    } catch {
      // IndexedDB can be unavailable in some browser/service-worker states.
    }

    try {
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.clearAppBadge === 'function'
      ) {
        await navigator.clearAppBadge()
      }
    } catch {
      // App badge support and permission behavior differs by browser/platform.
    }

    await closePortalChatNotifications()
  })
}

async function closePortalChatNotifications() {
  if (typeof self.registration.getNotifications !== 'function') {
    return
  }

  try {
    const notifications = await self.registration.getNotifications()

    for (const notification of notifications) {
      if (isPortalChatMessageNotification(notification)) {
        notification.close()
      }
    }
  } catch {
    // Notification cleanup should not block clearing the app badge fallback.
  }
}

async function closePortalChatNotificationsForThread(threadId) {
  if (typeof self.registration.getNotifications !== 'function') {
    return
  }

  try {
    const notifications = await self.registration.getNotifications()

    for (const notification of notifications) {
      if (
        isPortalChatMessageNotification(notification) &&
        notification.data?.threadId === threadId
      ) {
        notification.close()
      }
    }
  } catch {
    // Thread notification cleanup should not block the foreground read state.
  }
}

function isPortalChatMessageNotification(notification) {
  const tag = typeof notification.tag === 'string' ? notification.tag : null

  return Boolean(tag?.startsWith('portal-chat-message-'))
}

function runAppBadgeMutation(operation) {
  const queuedMutation = appBadgeMutationQueue.then(operation, operation)
  appBadgeMutationQueue = queuedMutation.catch(() => {})

  return queuedMutation
}

function openAppBadgeDatabase() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable.'))
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(APP_BADGE_DATABASE_NAME, 1)

    request.onupgradeneeded = () => {
      const database = request.result

      if (!database.objectStoreNames.contains(APP_BADGE_STORE_NAME)) {
        database.createObjectStore(APP_BADGE_STORE_NAME)
      }
    }
    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open app badge database.'))
    }
  })
}

async function writePersistedAppBadgeCount(count) {
  const database = await openAppBadgeDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(APP_BADGE_STORE_NAME, 'readwrite')
    const request = transaction
      .objectStore(APP_BADGE_STORE_NAME)
      .put(count, APP_BADGE_COUNT_KEY)

    request.onsuccess = () => {
      resolve()
    }
    request.onerror = () => {
      reject(request.error ?? new Error('Failed to write app badge count.'))
    }
    transaction.oncomplete = () => {
      database.close()
    }
    transaction.onabort = () => {
      database.close()
    }
  })
}

async function persistPushStaleMarkerBestEffort(payload) {
  try {
    await persistPushStaleMarker(payload)
  } catch {
    // Push notifications must still be delivered if IndexedDB is unavailable.
  }
}

async function persistPushStaleMarker(payload) {
  if (
    !payload.tenantSlug ||
    payload.portalUserId === null ||
    !payload.threadId ||
    payload.chatwootMessageId === null
  ) {
    return
  }

  const database = await openPortalOfflineDatabase()
  const key = `${payload.tenantSlug}:${payload.portalUserId}:${payload.threadId}:${payload.chatwootMessageId}`

  return new Promise((resolve, reject) => {
    const transaction = database.transaction('push_stale_markers', 'readwrite')
    transaction.objectStore('push_stale_markers').put(
      {
        chatwootMessageId: payload.chatwootMessageId,
        createdAt: new Date().toISOString(),
        tenantSlug: payload.tenantSlug,
        threadId: payload.threadId,
        userId: payload.portalUserId,
      },
      key,
    )
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => {
      database.close()
      reject(transaction.error)
    }
    transaction.onabort = () => {
      database.close()
      reject(transaction.error)
    }
  })
}

function openPortalOfflineDatabase() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable.'))
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      PORTAL_OFFLINE_DATABASE_NAME,
      PORTAL_OFFLINE_DATABASE_VERSION,
    )

    request.onupgradeneeded = () => {
      const database = request.result

      for (const storeName of PORTAL_OFFLINE_STORES) {
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName)
        }
      }
    }
    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onerror = () => {
      reject(
        request.error ?? new Error('Failed to open portal offline database.'),
      )
    }
  })
}

function buildNotificationCopy(payload) {
  const unreadLabel = formatUnreadMessageCount(payload.threadUnreadCount)

  if (payload.threadTitle && payload.threadType === 'group') {
    return {
      body: unreadLabel
        ? `${unreadLabel} в группе`
        : 'Новое сообщение в групповом чате',
      title: payload.threadTitle,
    }
  }

  if (payload.threadTitle && payload.threadType === 'private') {
    return {
      body: unreadLabel
        ? `${unreadLabel} в личном чате`
        : 'Новое сообщение в личном чате',
      title: payload.threadTitle,
    }
  }

  return {
    body: unreadLabel
      ? `${unreadLabel} в чате`
      : 'Откройте портал, чтобы посмотреть чат.',
    title: 'Новое сообщение',
  }
}

function formatUnreadMessageCount(count) {
  if (!Number.isSafeInteger(count) || count <= 0) {
    return null
  }

  const absoluteCount = Math.abs(count)
  const lastTwoDigits = absoluteCount % 100
  const lastDigit = absoluteCount % 10

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return `${count} новых сообщений`
  }

  if (lastDigit === 1) {
    return `${count} новое сообщение`
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return `${count} новых сообщения`
  }

  return `${count} новых сообщений`
}

function isReadyPortalClient(client) {
  return (
    client.visibilityState === 'visible' &&
    PUSH_READY_CLIENT_IDS.has(client.id) &&
    isSameOriginUrl(client.url)
  )
}

function canClientSuppressPush(client, threadId) {
  return isPushReadyForThread(client, threadId)
}

async function notifyPortalClients({ clientsList, payload }) {
  const portalClients = clientsList.filter(isReadyPortalClient)

  if (portalClients.length === 0) {
    return false
  }

  const results = await Promise.all(
    portalClients.map(async (client) => ({
      handled: await postPushMessageToClient(client, payload),
      suppressible: canClientSuppressPush(client, payload.threadId),
    })),
  )

  return results.some((result) => result.handled && result.suppressible)
}

function postPushMessageToClient(client, payload) {
  if (typeof MessageChannel === 'undefined') {
    client.postMessage({
      payload,
      type: 'PORTAL_PUSH_MESSAGE',
    })

    return Promise.resolve(false)
  }

  return new Promise((resolve) => {
    let didResolve = false
    const channel = new MessageChannel()
    const timeoutId = setTimeout(() => {
      resolveOnce(false)
    }, PUSH_CLIENT_RESPONSE_TIMEOUT_MS)

    function resolveOnce(value) {
      if (didResolve) {
        return
      }

      didResolve = true
      clearTimeout(timeoutId)
      channel.port1.close()
      resolve(value)
    }

    channel.port1.onmessage = (event) => {
      resolveOnce(event.data?.handled === true)
    }

    try {
      client.postMessage(
        {
          payload,
          type: 'PORTAL_PUSH_MESSAGE',
        },
        [channel.port2],
      )
    } catch {
      resolveOnce(false)
    }
  })
}

function readPushPayload(data) {
  if (!data) {
    return {
      chatwootMessageId: null,
      notificationTag: null,
      portalUserId: null,
      soundEnabled: true,
      tenantSlug: null,
      threadId: null,
      threadUnreadCount: null,
      threadTitle: null,
      threadType: null,
      totalUnreadCount: null,
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
      chatwootMessageId: Number.isSafeInteger(payload.chatwootMessageId)
        ? payload.chatwootMessageId
        : null,
      notificationTag:
        typeof payload.notificationTag === 'string' &&
        payload.notificationTag.length > 0
          ? payload.notificationTag
          : null,
      portalUserId: Number.isSafeInteger(payload.portalUserId)
        ? payload.portalUserId
        : null,
      soundEnabled:
        typeof payload.soundEnabled === 'boolean' ? payload.soundEnabled : true,
      tenantSlug:
        typeof payload.tenantSlug === 'string' ? payload.tenantSlug : null,
      threadId:
        typeof payload.threadId === 'string' && payload.threadId.length > 0
          ? payload.threadId
          : null,
      threadUnreadCount: Number.isSafeInteger(payload.threadUnreadCount)
        ? payload.threadUnreadCount
        : null,
      threadTitle:
        typeof payload.threadTitle === 'string' &&
        payload.threadTitle.trim().length > 0
          ? payload.threadTitle.trim().slice(0, 120)
          : null,
      threadType:
        payload.threadType === 'private' || payload.threadType === 'group'
          ? payload.threadType
          : null,
      totalUnreadCount: Number.isSafeInteger(payload.totalUnreadCount)
        ? payload.totalUnreadCount
        : null,
      type: payload.type === 'chat_message' ? 'chat_message' : 'chat_message',
      url: normalizeNotificationUrl(
        typeof payload.url === 'string' ? payload.url : '/',
      ),
    }
  } catch {
    return {
      chatwootMessageId: null,
      notificationTag: null,
      portalUserId: null,
      soundEnabled: true,
      tenantSlug: null,
      threadId: null,
      threadUnreadCount: null,
      threadTitle: null,
      threadType: null,
      totalUnreadCount: null,
      type: 'chat_message',
      url: '/',
    }
  }
}

async function handleNotificationClick(data) {
  const url = normalizeNotificationUrl(data?.url)
  const targetUrl = new URL(url, self.location.origin).href
  const clientsList = await clients.matchAll({
    includeUncontrolled: true,
    type: 'window',
  })
  const existingClient = clientsList.find((client) =>
    isSameOriginUrl(client.url),
  )

  if (existingClient) {
    if (
      existingClient.url !== targetUrl &&
      typeof existingClient.navigate === 'function'
    ) {
      const navigatedClient = await existingClient
        .navigate(targetUrl)
        .catch(() => null)
      await focusPortalClient(navigatedClient ?? existingClient)
      return
    }

    await focusPortalClient(existingClient)
    return
  }

  await clients.openWindow(targetUrl)
}

async function focusPortalClient(client) {
  if (client && typeof client.focus === 'function') {
    await client.focus()
  }
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
