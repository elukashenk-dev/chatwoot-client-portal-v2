export type ServiceWorkerStatusResult =
  | { assetCount: number; revision: string; status: 'ready' }
  | {
      reason: 'no_active_worker' | 'timeout' | 'unsupported'
      status: 'unavailable'
    }

const SERVICE_WORKER_STATUS_TIMEOUT_MS = 1000

function resolveReadyActiveWorker(container: ServiceWorkerContainer) {
  return new Promise<ServiceWorker | null>((resolve) => {
    const timeoutId = window.setTimeout(
      () => resolve(null),
      SERVICE_WORKER_STATUS_TIMEOUT_MS,
    )

    container.ready
      .then((registration) => {
        window.clearTimeout(timeoutId)
        resolve(registration.active ?? null)
      })
      .catch(() => {
        window.clearTimeout(timeoutId)
        resolve(null)
      })
  })
}

export async function queryActiveServiceWorkerStatus(): Promise<ServiceWorkerStatusResult> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return { reason: 'unsupported', status: 'unavailable' }
  }

  const container = navigator.serviceWorker
  const worker =
    container.controller ?? (await resolveReadyActiveWorker(container))

  if (!worker) {
    return { reason: 'no_active_worker', status: 'unavailable' }
  }

  return new Promise<ServiceWorkerStatusResult>((resolve) => {
    const channel = new MessageChannel()
    const timeoutId = window.setTimeout(() => {
      channel.port1.close()
      resolve({ reason: 'timeout', status: 'unavailable' })
    }, SERVICE_WORKER_STATUS_TIMEOUT_MS)

    channel.port1.onmessage = (event) => {
      window.clearTimeout(timeoutId)
      channel.port1.close()

      if (
        event.data?.type === 'PORTAL_SERVICE_WORKER_STATUS_RESULT' &&
        typeof event.data.revision === 'string' &&
        Number.isSafeInteger(event.data.assetCount)
      ) {
        resolve({
          assetCount: event.data.assetCount,
          revision: event.data.revision,
          status: 'ready',
        })
        return
      }

      resolve({ reason: 'timeout', status: 'unavailable' })
    }

    worker.postMessage({ type: 'PORTAL_SERVICE_WORKER_STATUS' }, [
      channel.port2,
    ])
  })
}
