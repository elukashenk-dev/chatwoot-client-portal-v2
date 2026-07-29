import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ChatApiClientError, sendChatAttachments } from '../api/chatClient'
import type { SendAttachmentBatchInput } from '../components/message-composer/types'
import type { ChatPageState } from './chatPageState'
import { useChatAttachmentSend } from './useChatAttachmentSend'

vi.mock('../api/chatClient', async () => {
  const actual =
    await vi.importActual<typeof import('../api/chatClient')>(
      '../api/chatClient',
    )

  return {
    ...actual,
    sendChatAttachments: vi.fn(),
  }
})

const sendChatAttachmentsMock = vi.mocked(sendChatAttachments)
const pageState = {
  cachedSavedAt: null,
  isUsingCachedData: false,
  selectedThreadId: 'private:me',
  snapshot: {
    activeThread: null,
    hasMoreOlder: false,
    messages: [],
    nextOlderCursor: null,
    reason: 'none',
    result: 'ready',
  },
  status: 'ready',
  threads: [],
} satisfies ChatPageState

function createInput(): SendAttachmentBatchInput {
  return {
    clientMessageKey: 'portal-send:attachment-retry',
    content: 'Подпись',
    items: [
      {
        file: new File(['invoice'], 'invoice.pdf', {
          type: 'application/pdf',
        }),
        id: 'invoice',
        source: 'picker',
      },
    ],
    replyToMessageId: 77,
  }
}

function renderAttachmentSendHook() {
  const handleConnectionUnavailableError = vi.fn(() => false)
  const handleUnauthorizedChatError = vi.fn(async () => false)

  const hook = renderHook(() =>
    useChatAttachmentSend({
      handleConnectionUnavailableError,
      handleUnauthorizedChatError,
      isBrowserOnline: true,
      isMountedRef: { current: true },
      markBrowserOnline: vi.fn(),
      pageState,
      setPageState: vi.fn(),
    }),
  )

  return {
    ...hook,
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
  }
}

describe('useChatAttachmentSend', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('cancels only the active upload and returns to a clean idle state', async () => {
    let activeSignal: AbortSignal | undefined
    let reportProgress: Parameters<
      typeof sendChatAttachments
    >[0]['onTransferStateChange']

    sendChatAttachmentsMock.mockImplementationOnce(
      ({ onTransferStateChange, signal }) =>
        new Promise((_resolve, reject) => {
          activeSignal = signal
          reportProgress = onTransferStateChange
          signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Request aborted.', 'AbortError')),
            { once: true },
          )
        }),
    )
    const { result } = renderAttachmentSendHook()
    let sendPromise: Promise<boolean> | undefined

    act(() => {
      sendPromise = result.current.handleSendAttachmentBatch(createInput())
    })
    act(() => {
      reportProgress?.({ percent: 42, stage: 'uploading' })
    })
    expect(result.current.transferState).toEqual({
      percent: 42,
      stage: 'uploading',
    })

    act(() => {
      result.current.cancelAttachmentUpload()
    })
    await act(async () => {
      await sendPromise
    })

    expect(activeSignal?.aborted).toBe(true)
    expect(result.current.transferState).toEqual({
      percent: null,
      stage: 'idle',
    })
    expect(result.current.sendErrorMessage).toBeNull()
  })

  it('does not let a cancelled request settle over an immediate manual retry', async () => {
    let rejectCancelledRequest: (error: unknown) => void = () => {}
    let reportRetryProgress: Parameters<
      typeof sendChatAttachments
    >[0]['onTransferStateChange']

    sendChatAttachmentsMock
      .mockImplementationOnce(
        ({ onTransferStateChange }) =>
          new Promise((_resolve, reject) => {
            rejectCancelledRequest = reject
            onTransferStateChange?.({ percent: 42, stage: 'uploading' })
          }),
      )
      .mockImplementationOnce(
        ({ onTransferStateChange }) =>
          new Promise(() => {
            reportRetryProgress = onTransferStateChange
          }),
      )
    const { result } = renderAttachmentSendHook()
    let cancelledSend: Promise<boolean> | undefined

    act(() => {
      cancelledSend = result.current.handleSendAttachmentBatch(createInput())
    })
    act(() => {
      result.current.cancelAttachmentUpload()
      void result.current.handleSendAttachmentBatch(createInput())
    })
    act(() => {
      reportRetryProgress?.({ percent: 63, stage: 'uploading' })
    })

    await act(async () => {
      rejectCancelledRequest(new DOMException('Request aborted.', 'AbortError'))
      await cancelledSend
    })

    expect(result.current.transferState).toEqual({
      percent: 63,
      stage: 'uploading',
    })
    expect(result.current.isSending).toBe(true)
  })

  it.each([
    [7, true],
    [3601, false],
  ] as const)(
    'preserves a failed draft and bounds Retry-After copy for %s seconds',
    async (retryAfterSeconds, shouldShowRetry) => {
      sendChatAttachmentsMock.mockRejectedValueOnce(
        new ChatApiClientError({
          message:
            'Не удалось загрузить файлы. Они остались в сообщении — попробуйте ещё раз.',
          retryAfterSeconds,
          statusCode: 503,
        }),
      )
      const { result } = renderAttachmentSendHook()

      await act(async () => {
        expect(
          await result.current.handleSendAttachmentBatch(createInput()),
        ).toBe(false)
      })

      expect(result.current.transferState).toEqual({
        percent: null,
        stage: 'error',
      })
      expect(result.current.sendErrorMessage).toContain(
        'Они остались в сообщении',
      )
      expect(result.current.sendErrorMessage?.includes('через 7 сек.')).toBe(
        shouldShowRetry,
      )
      await waitFor(() => {
        expect(result.current.isSending).toBe(false)
      })

      act(() => {
        result.current.setSendErrorMessage(null)
      })
      expect(result.current.transferState).toEqual({
        percent: null,
        stage: 'idle',
      })
    },
  )
})
