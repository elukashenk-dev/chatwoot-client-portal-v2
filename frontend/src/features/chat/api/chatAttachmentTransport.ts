import type { ChatSendResult } from '../types'

const CHAT_ATTACHMENT_REQUEST_TIMEOUT_MS = 10_000

type ApiErrorResponse = {
  error?: {
    code?: string
    message?: string
  }
}

export type AttachmentTransferState =
  | { percent: null; stage: 'error' | 'idle' }
  | { percent: 0; stage: 'preparing' }
  | { percent: number; stage: 'uploading' }
  | { percent: 100; stage: 'sending' }

export class ChatApiClientError extends Error {
  readonly code?: string
  readonly retryAfterSeconds: number | null
  readonly statusCode: number

  constructor({
    code,
    message,
    retryAfterSeconds = null,
    statusCode,
  }: {
    code?: string
    message: string
    retryAfterSeconds?: number | null
    statusCode: number
  }) {
    super(message)

    this.name = 'ChatApiClientError'
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
    this.statusCode = statusCode
  }
}

export function parseRetryAfterSeconds(
  retryAfter: string | null,
  nowMs = Date.now(),
) {
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

  const delaySeconds = Math.ceil((retryAtMs - nowMs) / 1000)

  return delaySeconds > 0 ? delaySeconds : null
}

function parseJsonText(value: string) {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

export function sendChatAttachmentRequest({
  formData,
  networkErrorMessage,
  onTransferStateChange,
  signal,
  url,
}: {
  formData: FormData
  networkErrorMessage: string
  onTransferStateChange?: (state: AttachmentTransferState) => void
  signal?: AbortSignal
  url: string
}) {
  return new Promise<ChatSendResult>((resolve, reject) => {
    const request = new XMLHttpRequest()
    let isSettled = false

    const cleanup = () => {
      signal?.removeEventListener('abort', handleSignalAbort)
    }
    const resolveOnce = (value: ChatSendResult) => {
      if (isSettled) {
        return
      }

      isSettled = true
      cleanup()
      resolve(value)
    }
    const rejectOnce = (error: unknown) => {
      if (isSettled) {
        return
      }

      isSettled = true
      cleanup()
      reject(error)
    }
    const rejectNetworkFailure = () => {
      rejectOnce(
        new ChatApiClientError({
          message: networkErrorMessage,
          statusCode: 0,
        }),
      )
    }

    function handleSignalAbort() {
      request.abort()
      rejectOnce(new DOMException('Request aborted.', 'AbortError'))
    }

    request.upload.addEventListener('loadstart', () => {
      onTransferStateChange?.({ percent: 0, stage: 'preparing' })
    })
    request.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable || event.total <= 0) {
        return
      }

      const percent = Math.min(
        99,
        Math.max(0, Math.round((event.loaded / event.total) * 100)),
      )

      onTransferStateChange?.({ percent, stage: 'uploading' })
    })
    request.upload.addEventListener('load', () => {
      onTransferStateChange?.({ percent: 100, stage: 'sending' })
    })
    request.onload = () => {
      const payload = parseJsonText(request.responseText)

      if (request.status >= 200 && request.status < 300) {
        resolveOnce(payload as ChatSendResult)
        return
      }

      const errorPayload = payload as ApiErrorResponse | null

      rejectOnce(
        new ChatApiClientError({
          code: errorPayload?.error?.code,
          message: errorPayload?.error?.message ?? networkErrorMessage,
          retryAfterSeconds: parseRetryAfterSeconds(
            request.getResponseHeader('Retry-After'),
          ),
          statusCode: request.status,
        }),
      )
    }
    request.onerror = rejectNetworkFailure
    request.ontimeout = rejectNetworkFailure
    request.onabort = () => {
      rejectOnce(new DOMException('Request aborted.', 'AbortError'))
    }

    request.open('POST', url, true)
    request.withCredentials = true
    request.timeout = CHAT_ATTACHMENT_REQUEST_TIMEOUT_MS

    if (signal?.aborted) {
      handleSignalAbort()
      return
    }

    signal?.addEventListener('abort', handleSignalAbort, { once: true })
    request.send(formData)
  })
}
