import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ChatMessage } from '../types'
import { ChatTranscript } from './ChatTranscript'
import { getTranscriptScrollAction } from './ChatTranscriptScroll'

function createMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    attachments: [],
    authorName: 'Вы',
    content: 'Сообщение',
    contentType: 'text',
    createdAt: '2026-04-21T10:00:00',
    direction: 'outgoing',
    id: 1,
    status: 'sent',
    ...overrides,
  }
}

function renderTranscript(messages: ChatMessage[]) {
  return render(
    <ChatTranscript
      hasMoreOlder={false}
      historyErrorMessage={null}
      isLoadingOlder={false}
      messages={messages}
      onLoadOlder={vi.fn()}
    />,
  )
}

function getBubble(container: HTMLElement, messageId: number) {
  const message = container.querySelector(`[data-message-id="${messageId}"]`)
  const bubble = message?.querySelector('[data-chat-bubble]')

  if (!(bubble instanceof HTMLElement)) {
    throw new Error(`Missing message bubble ${messageId}.`)
  }

  return bubble
}

describe('ChatTranscript', () => {
  it('groups consecutive outgoing bubbles with metadata only on the final message', () => {
    const { container } = renderTranscript([
      createMessage({
        content: 'Первое мое сообщение',
        createdAt: '2026-04-21T10:00:00',
        id: 1,
      }),
      createMessage({
        content: 'Второе мое сообщение',
        createdAt: '2026-04-21T10:01:00',
        id: 2,
      }),
      createMessage({
        content: 'Последнее мое сообщение',
        createdAt: '2026-04-21T10:02:00',
        id: 3,
      }),
    ])

    expect(screen.queryByText('Apr 21, 10:00 AM')).not.toBeInTheDocument()
    expect(screen.queryByText('Apr 21, 10:01 AM')).not.toBeInTheDocument()
    expect(screen.getByText('Apr 21, 10:02 AM')).toBeInTheDocument()
    expect(screen.getByText('Вы')).toBeInTheDocument()

    const dayDividerLabel = screen.getByText('21 апреля')
    expect(dayDividerLabel).toHaveClass(
      'border-brand-100',
      'bg-brand-50',
      'text-brand-700',
    )
    expect(dayDividerLabel.parentElement).toHaveClass('max-w-[520px]', 'gap-3')

    expect(getBubble(container, 1)).toHaveClass('rounded-br-none')
    expect(getBubble(container, 1)).toHaveClass('bg-brand-800', 'text-white')
    expect(getBubble(container, 1)).not.toHaveClass('rounded-tr-none')
    expect(getBubble(container, 2)).toHaveClass(
      'rounded-br-none',
      'rounded-tr-none',
    )
    expect(getBubble(container, 3)).toHaveClass('rounded-tr-none')
    expect(getBubble(container, 3)).not.toHaveClass('rounded-br-none')
  })

  it('mirrors consecutive incoming bubble corners to the left side', () => {
    const { container } = renderTranscript([
      createMessage({
        authorName: 'Ольга Support',
        content: 'Первый ответ агента',
        createdAt: '2026-04-21T10:00:00',
        direction: 'incoming',
        id: 1,
      }),
      createMessage({
        authorName: 'Ольга Support',
        content: 'Последний ответ агента',
        createdAt: '2026-04-21T10:01:00',
        direction: 'incoming',
        id: 2,
      }),
    ])

    expect(screen.queryByText('Apr 21, 10:00 AM')).not.toBeInTheDocument()
    expect(screen.getByText('Apr 21, 10:01 AM')).toBeInTheDocument()
    expect(getBubble(container, 1)).toHaveClass('rounded-bl-none')
    expect(getBubble(container, 1)).toHaveClass('bg-white', 'text-slate-700')
    expect(getBubble(container, 1)).not.toHaveClass('rounded-tl-none')
    expect(getBubble(container, 2)).toHaveClass('rounded-tl-none')
    expect(getBubble(container, 2)).not.toHaveClass('rounded-bl-none')
  })

  it('keeps the latest message visible when new messages arrive at the bottom edge', () => {
    expect(
      getTranscriptScrollAction({
        currentBoundary: {
          firstMessageId: 1,
          lastMessageId: 3,
          latestMessageDirection: 'incoming',
          messageCount: 3,
        },
        currentScrollHeight: 1200,
        previousSnapshot: {
          clientHeight: 320,
          firstMessageId: 1,
          lastMessageId: 2,
          latestMessageDirection: 'incoming',
          messageCount: 2,
          scrollHeight: 1000,
          scrollTop: 632,
          wasNearBottom: true,
        },
      }),
    ).toEqual({
      type: 'scroll_to_bottom',
    })
  })

  it('preserves the visual anchor when older messages are prepended', () => {
    expect(
      getTranscriptScrollAction({
        currentBoundary: {
          firstMessageId: 1,
          lastMessageId: 5,
          latestMessageDirection: 'incoming',
          messageCount: 5,
        },
        currentScrollHeight: 1500,
        previousSnapshot: {
          clientHeight: 320,
          firstMessageId: 3,
          lastMessageId: 5,
          latestMessageDirection: 'incoming',
          messageCount: 3,
          scrollHeight: 1000,
          scrollTop: 220,
          wasNearBottom: false,
        },
      }),
    ).toEqual({
      nextScrollTop: 720,
      type: 'preserve_prepend',
    })
  })
})
