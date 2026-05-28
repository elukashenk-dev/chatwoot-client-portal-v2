import {
  OFFLINE_LOW_QUOTA_USAGE_RATIO,
  type OfflineStorageEstimate,
} from './types'

type NavigatorWithStorage = Navigator & {
  storage?: {
    estimate?: () => Promise<StorageEstimate>
    persist?: () => Promise<boolean>
  }
}

const emptyEstimate: OfflineStorageEstimate = {
  isLowQuota: false,
  quota: null,
  usage: null,
  usageRatio: null,
}

export async function requestOfflineStoragePersistence() {
  const storage = (navigator as NavigatorWithStorage).storage

  if (!storage || typeof storage.persist !== 'function') {
    return false
  }

  try {
    return await storage.persist()
  } catch {
    return false
  }
}

export function isOfflineStorageQuotaError(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const domError = error as { code?: unknown; name?: unknown }

  return (
    domError.name === 'QuotaExceededError' ||
    domError.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    domError.code === 22 ||
    domError.code === 1014
  )
}

export function isOfflineStorageUnavailableError(error: unknown) {
  if (isOfflineStorageQuotaError(error)) {
    return true
  }

  if (typeof error !== 'object' || error === null) {
    return false
  }

  const domError = error as { name?: unknown }

  return (
    domError.name === 'InvalidStateError' ||
    domError.name === 'NotFoundError' ||
    domError.name === 'UnknownError' ||
    domError.name === 'VersionError'
  )
}

export async function estimateOfflineStorage(): Promise<OfflineStorageEstimate> {
  const storage = (navigator as NavigatorWithStorage).storage

  if (!storage || typeof storage.estimate !== 'function') {
    return emptyEstimate
  }

  try {
    const estimate = await storage.estimate()
    const quota = typeof estimate.quota === 'number' ? estimate.quota : null
    const usage = typeof estimate.usage === 'number' ? estimate.usage : null
    const usageRatio =
      quota !== null && quota > 0 && usage !== null ? usage / quota : null

    return {
      isLowQuota:
        usageRatio !== null && usageRatio >= OFFLINE_LOW_QUOTA_USAGE_RATIO,
      quota,
      usage,
      usageRatio,
    }
  } catch {
    return emptyEstimate
  }
}
