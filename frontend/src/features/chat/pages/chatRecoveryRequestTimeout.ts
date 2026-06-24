import {
  BOOT_REQUEST_TIMEOUT_MS,
  createRequestTimeout,
} from '../../offline/bootCoordinator'

export const CHAT_RECOVERY_REQUEST_TIMEOUT_MS = BOOT_REQUEST_TIMEOUT_MS

export async function withChatRecoveryRequestTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = CHAT_RECOVERY_REQUEST_TIMEOUT_MS,
): Promise<T> {
  const timeout = createRequestTimeout(timeoutMs)

  try {
    return await operation(timeout.signal)
  } finally {
    timeout.cancel()
  }
}
