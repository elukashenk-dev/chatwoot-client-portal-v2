import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ChatApiClientError,
  sendChatAttachmentRequest,
  type AttachmentTransferState,
} from './chatAttachmentTransport'

type UploadEventName = 'load' | 'loadstart' | 'progress'

class FakeUploadTarget {
  private readonly listeners = new Map<
    UploadEventName,
    (event: ProgressEvent) => void
  >()

  addEventListener(
    type: UploadEventName,
    listener: (event: ProgressEvent) => void,
  ) {
    this.listeners.set(type, listener)
  }

  emit(type: UploadEventName, options: ProgressEventInit = {}) {
    this.listeners.get(type)?.(new ProgressEvent(type, options))
  }
}

class FakeXMLHttpRequest {
  static instances: FakeXMLHttpRequest[] = []

  readonly abort = vi.fn(() => {
    this.onabort?.(new ProgressEvent('abort'))
  })
  readonly open = vi.fn()
  readonly send = vi.fn()
  readonly upload = new FakeUploadTarget()
  onabort: ((event: ProgressEvent) => void) | null = null
  onerror: ((event: ProgressEvent) => void) | null = null
  onload: ((event: ProgressEvent) => void) | null = null
  ontimeout: ((event: ProgressEvent) => void) | null = null
  responseText = ''
  status = 0
  timeout = 0
  withCredentials = false
  private readonly responseHeaders = new Map<string, string>()

  constructor() {
    FakeXMLHttpRequest.instances.push(this)
  }

  getResponseHeader(name: string) {
    return this.responseHeaders.get(name.toLowerCase()) ?? null
  }

  setResponseHeader(name: string, value: string) {
    this.responseHeaders.set(name.toLowerCase(), value)
  }
}

function latestRequest() {
  const request = FakeXMLHttpRequest.instances.at(-1)

  if (!request) {
    throw new Error('Expected an XMLHttpRequest instance.')
  }

  return request
}

function createSuccessfulSendPayload() {
  return {
    activeThread: {
      id: 'private:me',
      subtitle: 'Вы и поддержка',
      title: 'Личный чат',
      type: 'private',
    },
    reason: 'none',
    result: 'ready',
    sentMessage: null,
  }
}

describe('sendChatAttachmentRequest', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'XMLHttpRequest',
      FakeXMLHttpRequest as unknown as typeof XMLHttpRequest,
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    FakeXMLHttpRequest.instances = []
  })

  it('uses the portal session, bounded timeout and aggregate upload progress', async () => {
    const formData = new FormData()
    const transferStates: AttachmentTransferState[] = []
    const requestPromise = sendChatAttachmentRequest({
      formData,
      networkErrorMessage: 'Не удалось загрузить файлы.',
      onTransferStateChange: (state) => transferStates.push(state),
      url: '/api/chat/messages/attachments',
    })
    const request = latestRequest()

    expect(request.open).toHaveBeenCalledWith(
      'POST',
      '/api/chat/messages/attachments',
      true,
    )
    expect(request.withCredentials).toBe(true)
    expect(request.timeout).toBe(10_000)
    expect(request.send).toHaveBeenCalledWith(formData)

    request.upload.emit('loadstart')
    request.upload.emit('progress', {
      lengthComputable: true,
      loaded: 25,
      total: 100,
    })
    request.upload.emit('progress', {
      lengthComputable: true,
      loaded: 75,
      total: 100,
    })
    request.upload.emit('load')

    expect(transferStates).toEqual([
      { percent: 0, stage: 'preparing' },
      { percent: 25, stage: 'uploading' },
      { percent: 75, stage: 'uploading' },
      { percent: 100, stage: 'sending' },
    ])

    request.status = 200
    request.responseText = JSON.stringify(createSuccessfulSendPayload())
    request.onload?.(new ProgressEvent('load'))

    await expect(requestPromise).resolves.toMatchObject({
      result: 'ready',
    })
  })

  it('preserves JSON error details and Retry-After metadata', async () => {
    const requestPromise = sendChatAttachmentRequest({
      formData: new FormData(),
      networkErrorMessage: 'Не удалось загрузить файлы.',
      url: '/api/chat/messages/attachments',
    })
    const request = latestRequest()

    request.status = 429
    request.responseText = JSON.stringify({
      error: {
        code: 'CHAT_SEND_RATE_LIMITED',
        message: 'Слишком много сообщений. Попробуйте позже.',
      },
    })
    request.setResponseHeader('Content-Type', 'application/json')
    request.setResponseHeader('Retry-After', '7')
    request.onload?.(new ProgressEvent('load'))

    await expect(requestPromise).rejects.toMatchObject({
      code: 'CHAT_SEND_RATE_LIMITED',
      message: 'Слишком много сообщений. Попробуйте позже.',
      retryAfterSeconds: 7,
      statusCode: 429,
    } satisfies Partial<ChatApiClientError>)
  })

  it('exposes unauthorized responses to the shared session handler', async () => {
    const requestPromise = sendChatAttachmentRequest({
      formData: new FormData(),
      networkErrorMessage: 'Не удалось загрузить файлы.',
      url: '/api/chat/messages/attachments',
    })
    const request = latestRequest()

    request.status = 401
    request.responseText = JSON.stringify({
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Нужно войти снова.',
      },
    })
    request.setResponseHeader('Content-Type', 'application/json')
    request.onload?.(new ProgressEvent('load'))

    await expect(requestPromise).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      statusCode: 401,
    } satisfies Partial<ChatApiClientError>)
  })

  it.each(['network', 'timeout'] as const)(
    'maps a %s failure to status code zero',
    async (failure) => {
      const requestPromise = sendChatAttachmentRequest({
        formData: new FormData(),
        networkErrorMessage: 'Не удалось загрузить файлы.',
        url: '/api/chat/messages/attachments',
      })
      const request = latestRequest()

      if (failure === 'network') {
        request.onerror?.(new ProgressEvent('error'))
      } else {
        request.ontimeout?.(new ProgressEvent('timeout'))
      }

      await expect(requestPromise).rejects.toMatchObject({
        message: 'Не удалось загрузить файлы.',
        statusCode: 0,
      } satisfies Partial<ChatApiClientError>)
    },
  )

  it('aborts the active XHR when its AbortSignal is cancelled', async () => {
    const abortController = new AbortController()
    const requestPromise = sendChatAttachmentRequest({
      formData: new FormData(),
      networkErrorMessage: 'Не удалось загрузить файлы.',
      signal: abortController.signal,
      url: '/api/chat/messages/attachments',
    })
    const request = latestRequest()

    abortController.abort()

    expect(request.abort).toHaveBeenCalledTimes(1)
    await expect(requestPromise).rejects.toMatchObject({
      name: 'AbortError',
    })
  })
})
