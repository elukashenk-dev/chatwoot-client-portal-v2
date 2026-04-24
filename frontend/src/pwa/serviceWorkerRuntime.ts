type ServiceWorkerUpdateStatus =
  | 'idle'
  | 'unsupported'
  | 'update_available'
  | 'applying'

export type ServiceWorkerUpdateSnapshot = {
  isSupported: boolean
  status: ServiceWorkerUpdateStatus
}

type UpdateListener = (snapshot: ServiceWorkerUpdateSnapshot) => void

const updateListeners = new Set<UpdateListener>()
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
