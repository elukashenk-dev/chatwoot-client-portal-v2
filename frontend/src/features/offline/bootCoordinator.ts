export const BOOT_LOCAL_CACHE_READ_DEADLINE_MS = 1000
export const BOOT_ONLINE_REQUIRED_MS = 8000
export const BOOT_REQUEST_TIMEOUT_MS = 10000

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

export function withBootReadDeadline<T>(
  promise: Promise<T>,
  fallbackValue: T,
  timeoutMs = BOOT_ONLINE_REQUIRED_MS,
) {
  let timeoutId: number | null = null

  return new Promise<T>((resolve) => {
    let isSettled = false

    const settle = (value: T) => {
      if (isSettled) {
        return
      }

      isSettled = true

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }

      resolve(value)
    }

    timeoutId = window.setTimeout(() => {
      settle(fallbackValue)
    }, timeoutMs)

    void promise.then(settle, () => settle(fallbackValue))
  })
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
