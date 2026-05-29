export const OFFLINE_TEXT_OUTBOX_SYNC_TAG = 'portal-text-outbox-drain'

type ServiceWorkerRegistrationWithSync = ServiceWorkerRegistration & {
  sync?: {
    register: (tag: string) => Promise<void>
  }
}

export async function registerOfflineTextOutboxBackgroundSync() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return false
  }

  try {
    const registration = (await navigator.serviceWorker
      .ready) as ServiceWorkerRegistrationWithSync

    if (!registration.sync) {
      return false
    }

    await registration.sync.register(OFFLINE_TEXT_OUTBOX_SYNC_TAG)

    return true
  } catch {
    return false
  }
}
