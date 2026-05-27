type ServiceWorkerUpdateStatus =
  | 'idle'
  | 'unsupported'
  | 'update_available'
  | 'applying'

export type ServiceWorkerUpdateSnapshot = {
  isSupported: boolean
  status: ServiceWorkerUpdateStatus
}

export type BrowserPushSupportState =
  | {
      reason: 'supported'
      supported: true
    }
  | {
      reason:
        | 'insecure_context'
        | 'notifications_unavailable'
        | 'push_unavailable'
        | 'service_worker_unavailable'
      supported: false
    }

export type PortalPushMessagePayload = {
  chatwootMessageId: number | null
  tenantSlug: string | null
  threadId: string | null
  threadTitle: string | null
  threadType: 'group' | 'private' | null
  type: 'chat_message'
  url: string
}

type PortalPushMessageHandler = (
  payload: PortalPushMessagePayload,
) => boolean | Promise<boolean>
type RegisterPortalPushMessageListenerOptions = {
  activeThreadId?: string | null
}
type UpdateListener = (snapshot: ServiceWorkerUpdateSnapshot) => void

const updateListeners = new Set<UpdateListener>()
const SERVICE_WORKER_READY_TIMEOUT_MS = 2000
const defaultSnapshot: ServiceWorkerUpdateSnapshot = {
  isSupported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
  status:
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? 'idle'
      : 'unsupported',
}

let controllerChangeListenerAttached = false
let hasReloadedForControllerChange = false
let serviceWorkerUpdateSnapshot = defaultSnapshot
let waitingWorker: ServiceWorker | null = null

function emitSnapshot() {
  for (const listener of updateListeners) {
    listener(serviceWorkerUpdateSnapshot)
  }
}

function updateSnapshot(nextSnapshot: ServiceWorkerUpdateSnapshot) {
  serviceWorkerUpdateSnapshot = nextSnapshot
  emitSnapshot()
}

function markUpdateAvailable(worker: ServiceWorker | null) {
  waitingWorker = worker

  updateSnapshot({
    isSupported: true,
    status: worker ? 'update_available' : 'idle',
  })
}

function attachControllerChangeReload() {
  if (
    controllerChangeListenerAttached ||
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator)
  ) {
    return
  }

  controllerChangeListenerAttached = true
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (
      serviceWorkerUpdateSnapshot.status !== 'applying' ||
      hasReloadedForControllerChange
    ) {
      return
    }

    hasReloadedForControllerChange = true
    window.location.reload()
  })
}

function trackInstallingWorker(worker: ServiceWorker | null) {
  if (!worker) {
    return
  }

  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      markUpdateAvailable(worker)
    }
  })
}

function monitorRegistration(registration: ServiceWorkerRegistration) {
  if (registration.waiting && navigator.serviceWorker.controller) {
    markUpdateAvailable(registration.waiting)
  }

  registration.addEventListener('updatefound', () => {
    trackInstallingWorker(registration.installing)
  })
}

export function getBrowserPushSupportState(): BrowserPushSupportState {
  if (typeof window === 'undefined' || !window.isSecureContext) {
    return {
      reason: 'insecure_context',
      supported: false,
    }
  }

  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return {
      reason: 'service_worker_unavailable',
      supported: false,
    }
  }

  if (!('PushManager' in window)) {
    return {
      reason: 'push_unavailable',
      supported: false,
    }
  }

  if (!('Notification' in window)) {
    return {
      reason: 'notifications_unavailable',
      supported: false,
    }
  }

  return {
    reason: 'supported',
    supported: true,
  }
}

function assertBrowserPushSupported() {
  const support = getBrowserPushSupportState()

  if (!support.supported) {
    throw new Error(`Browser push is not supported: ${support.reason}`)
  }
}

function base64UrlToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index)
  }

  return outputArray
}

function areUint8ArraysEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}

export function isBrowserPushSubscriptionForPublicKey(
  subscription: PushSubscription,
  publicKey: string,
) {
  const applicationServerKey = subscription.options.applicationServerKey

  if (!applicationServerKey) {
    return true
  }

  return areUint8ArraysEqual(
    new Uint8Array(applicationServerKey),
    base64UrlToUint8Array(publicKey),
  )
}

async function getReadyServiceWorkerRegistration() {
  assertBrowserPushSupported()
  await startServiceWorkerRuntime()

  const registration = await navigator.serviceWorker.ready

  if (!registration.pushManager) {
    throw new Error('Browser push manager is unavailable.')
  }

  return registration
}

async function waitForReadyServiceWorkerRegistration() {
  let timeoutId: number | null = null

  try {
    return await Promise.race<ServiceWorkerRegistration | null>([
      navigator.serviceWorker.ready,
      new Promise<ServiceWorkerRegistration | null>((resolve) => {
        timeoutId = window.setTimeout(() => {
          resolve(null)
        }, SERVICE_WORKER_READY_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId)
    }
  }
}

export async function getExistingBrowserPushSubscription() {
  const support = getBrowserPushSupportState()

  if (!support.supported) {
    return null
  }

  const didStart = await startServiceWorkerRuntime()

  if (!didStart) {
    return null
  }

  const registration = await waitForReadyServiceWorkerRegistration()

  if (!registration) {
    return null
  }

  if (!registration.pushManager) {
    return null
  }

  return registration.pushManager.getSubscription()
}

export async function subscribeBrowserPush(publicKey: string) {
  const registration = await getReadyServiceWorkerRegistration()
  const existingSubscription = await registration.pushManager.getSubscription()

  if (existingSubscription) {
    if (
      isBrowserPushSubscriptionForPublicKey(existingSubscription, publicKey)
    ) {
      return existingSubscription.toJSON()
    }

    await existingSubscription.unsubscribe()
  }

  const subscription = await registration.pushManager.subscribe({
    applicationServerKey: base64UrlToUint8Array(publicKey),
    userVisibleOnly: true,
  })

  return subscription.toJSON()
}

export async function unsubscribeBrowserPush() {
  const existingSubscription = await getExistingBrowserPushSubscription()

  if (!existingSubscription) {
    return null
  }

  const endpoint = existingSubscription.endpoint
  const didUnsubscribe = await existingSubscription.unsubscribe()

  return didUnsubscribe ? endpoint : null
}

export function registerPortalPushMessageListener(
  handler: PortalPushMessageHandler,
  { activeThreadId = null }: RegisterPortalPushMessageListenerOptions = {},
) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {}
  }

  function postClientReadyState(type: string) {
    navigator.serviceWorker.controller?.postMessage({
      ...(type === 'PORTAL_PUSH_CLIENT_READY' ? { activeThreadId } : {}),
      type,
    })
  }

  function handleMessage(event: MessageEvent) {
    if (event.data?.type !== 'PORTAL_PUSH_MESSAGE') {
      return
    }

    const payload = {
      chatwootMessageId: Number.isSafeInteger(
        event.data.payload?.chatwootMessageId,
      )
        ? event.data.payload.chatwootMessageId
        : null,
      tenantSlug:
        typeof event.data.payload?.tenantSlug === 'string'
          ? event.data.payload.tenantSlug
          : null,
      threadId:
        typeof event.data.payload?.threadId === 'string' &&
        event.data.payload.threadId.length > 0
          ? event.data.payload.threadId
          : null,
      threadTitle:
        typeof event.data.payload?.threadTitle === 'string' &&
        event.data.payload.threadTitle.trim().length > 0
          ? event.data.payload.threadTitle.trim()
          : null,
      threadType:
        event.data.payload?.threadType === 'private' ||
        event.data.payload?.threadType === 'group'
          ? event.data.payload.threadType
          : null,
      type: 'chat_message',
      url:
        typeof event.data.payload?.url === 'string'
          ? event.data.payload.url
          : '/',
    } satisfies PortalPushMessagePayload
    const responsePort = event.ports[0]

    void Promise.resolve(handler(payload))
      .then((handled) => {
        responsePort?.postMessage({
          handled: handled === true,
        })
      })
      .catch(() => {
        responsePort?.postMessage({
          handled: false,
        })
      })
  }

  function handleControllerChange() {
    postClientReadyState('PORTAL_PUSH_CLIENT_READY')
  }

  navigator.serviceWorker.addEventListener('message', handleMessage)
  navigator.serviceWorker.addEventListener(
    'controllerchange',
    handleControllerChange,
  )
  postClientReadyState('PORTAL_PUSH_CLIENT_READY')

  return () => {
    navigator.serviceWorker.removeEventListener('message', handleMessage)
    navigator.serviceWorker.removeEventListener(
      'controllerchange',
      handleControllerChange,
    )
    postClientReadyState('PORTAL_PUSH_CLIENT_NOT_READY')
  }
}

export async function startServiceWorkerRuntime() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    updateSnapshot({
      isSupported: false,
      status: 'unsupported',
    })
    return false
  }

  attachControllerChangeReload()

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    })

    monitorRegistration(registration)
    void registration.update().catch(() => {})

    return true
  } catch (error) {
    console.error('Service worker registration failed:', error)
    return false
  }
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD || typeof window === 'undefined') {
    return
  }

  if (!('serviceWorker' in navigator)) {
    updateSnapshot({
      isSupported: false,
      status: 'unsupported',
    })
    return
  }

  window.addEventListener(
    'load',
    () => {
      void startServiceWorkerRuntime()
    },
    { once: true },
  )
}

export function subscribeToServiceWorkerUpdates(listener: UpdateListener) {
  updateListeners.add(listener)
  listener(serviceWorkerUpdateSnapshot)

  return () => {
    updateListeners.delete(listener)
  }
}

export function getServiceWorkerUpdateSnapshot() {
  return serviceWorkerUpdateSnapshot
}

export function applyServiceWorkerUpdate() {
  if (!waitingWorker) {
    return false
  }

  updateSnapshot({
    isSupported: true,
    status: 'applying',
  })
  waitingWorker.postMessage({
    type: 'SKIP_WAITING',
  })

  return true
}

export function resetServiceWorkerRuntimeForTests() {
  controllerChangeListenerAttached = false
  hasReloadedForControllerChange = false
  serviceWorkerUpdateSnapshot = defaultSnapshot
  waitingWorker = null
  updateListeners.clear()
}

export const serviceWorkerRuntimeInternalsForTests = {
  areUint8ArraysEqual,
  base64UrlToUint8Array,
}
