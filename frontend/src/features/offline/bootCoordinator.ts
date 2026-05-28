export const BOOT_SLOW_NOTICE_MS = 1200
export const BOOT_CACHE_FALLBACK_MS = 2500
export const BOOT_ONLINE_REQUIRED_MS = 8000
export const BOOT_REQUEST_TIMEOUT_MS = 10000

export type BootRuntimeState =
  | 'boot_error'
  | 'checking_online'
  | 'online_required'
  | 'opening_saved_data'
  | 'ready_cached'
  | 'ready_online'
  | 'session_check_required'
  | 'slow_connection'

export function getBootStatusForElapsedMs(
  elapsedMs: number,
  hasValidCache: boolean,
): BootRuntimeState {
  if (elapsedMs >= BOOT_ONLINE_REQUIRED_MS && !hasValidCache) {
    return 'online_required'
  }

  if (elapsedMs >= BOOT_CACHE_FALLBACK_MS && hasValidCache) {
    return 'opening_saved_data'
  }

  if (elapsedMs >= BOOT_SLOW_NOTICE_MS) {
    return 'slow_connection'
  }

  return 'checking_online'
}

export function createRequestTimeoutSignal(
  timeoutMs = BOOT_REQUEST_TIMEOUT_MS,
) {
  if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
    return AbortSignal.timeout(timeoutMs)
  }

  return createRequestTimeout(timeoutMs).signal
}

export function createRequestTimeout(timeoutMs = BOOT_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  return {
    cancel: () => {
      window.clearTimeout(timeoutId)
    },
    signal: controller.signal,
  }
}

export function isNetworkOrTimeoutError(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const candidate = error as { name?: unknown }

  return (
    candidate.name === 'AbortError' ||
    candidate.name === 'TimeoutError' ||
    candidate.name === 'NetworkError'
  )
}
