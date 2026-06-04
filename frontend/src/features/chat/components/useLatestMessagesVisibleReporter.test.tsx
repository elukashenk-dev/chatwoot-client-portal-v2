import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ChatMessage } from '../types'
import { useLatestMessagesVisibleReporter } from './useLatestMessagesVisibleReporter'

function createMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    attachments: [],
    authorName: 'Вы',
    authorRole: 'current_user',
    content: 'Сообщение',
    contentType: 'text',
    createdAt: '2026-04-21T10:00:00',
    direction: 'outgoing',
    id: 1,
    status: 'sent',
    ...overrides,
  }
}

function createDomRect({
  bottom,
  top,
}: {
  bottom: number
  top: number
}) {
  return {
    bottom,
    height: bottom - top,
    left: 0,
    right: 320,
    toJSON: () => ({}),
    top,
    width: 320,
    x: 0,
    y: top,
  } satisfies DOMRect
}

function createScrollElement(
  messageRects: Record<number, { bottom: number; top: number }>,
) {
  const scrollElement = document.createElement('section')

  Object.defineProperty(scrollElement, 'clientHeight', {
    configurable: true,
    value: 500,
  })
  Object.defineProperty(scrollElement, 'scrollHeight', {
    configurable: true,
    value: 1000,
  })
  Object.defineProperty(scrollElement, 'scrollTop', {
    configurable: true,
    value: 500,
  })
  scrollElement.getBoundingClientRect = () =>
    createDomRect({ bottom: 500, top: 0 })

  for (const [messageId, rect] of Object.entries(messageRects)) {
    const messageElement = document.createElement('div')

    messageElement.dataset.messageId = messageId
    messageElement.getBoundingClientRect = () => createDomRect(rect)
    scrollElement.append(messageElement)
  }

  return scrollElement
}

describe('useLatestMessagesVisibleReporter', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports the latest visible agent message at the latest transcript edge', () => {
    const onLatestMessagesVisible = vi.fn()
    const scrollElement = createScrollElement({
      101: { bottom: 180, top: 120 },
      102: { bottom: 480, top: 420 },
    })
    const { result } = renderHook(() =>
      useLatestMessagesVisibleReporter({
        hasHistoryFragmentControls: false,
        messages: [
          createMessage({
            authorName: 'Ольга Support',
            authorRole: 'agent',
            direction: 'incoming',
            id: 101,
          }),
          createMessage({
            content: 'Мое сообщение после ответа поддержки',
            id: 102,
          }),
        ],
        onLatestMessagesVisible,
      }),
    )

    act(() => {
      result.current(scrollElement)
    })

    expect(onLatestMessagesVisible).toHaveBeenCalledWith({
      latestVisibleAgentMessageId: 101,
    })
  })

  it('does not report an agent message that is no longer visible in the transcript viewport', () => {
    const onLatestMessagesVisible = vi.fn()
    const scrollElement = createScrollElement({
      101: { bottom: -40, top: -120 },
      102: { bottom: 480, top: 420 },
    })
    const { result } = renderHook(() =>
      useLatestMessagesVisibleReporter({
        hasHistoryFragmentControls: false,
        messages: [
          createMessage({
            authorName: 'Ольга Support',
            authorRole: 'agent',
            direction: 'incoming',
            id: 101,
          }),
          createMessage({
            content: 'Мое сообщение у нижнего края',
            id: 102,
          }),
        ],
        onLatestMessagesVisible,
      }),
    )

    act(() => {
      result.current(scrollElement)
    })

    expect(onLatestMessagesVisible).toHaveBeenCalledWith({
      latestVisibleAgentMessageId: null,
    })
  })

  it('does not report visible messages while a history fragment is open', () => {
    const onLatestMessagesVisible = vi.fn()
    const scrollElement = createScrollElement({
      101: { bottom: 180, top: 120 },
    })
    const { result } = renderHook(() =>
      useLatestMessagesVisibleReporter({
        hasHistoryFragmentControls: true,
        messages: [
          createMessage({
            authorName: 'Ольга Support',
            authorRole: 'agent',
            direction: 'incoming',
            id: 101,
          }),
        ],
        onLatestMessagesVisible,
      }),
    )

    act(() => {
      result.current(scrollElement)
    })

    expect(onLatestMessagesVisible).not.toHaveBeenCalled()
  })
})
