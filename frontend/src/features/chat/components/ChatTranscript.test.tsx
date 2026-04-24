import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

function renderTranscript(
  messages: ChatMessage[],
  {
    onReplyToMessage = vi.fn(),
  }: {
    onReplyToMessage?: (message: ChatMessage) => void
  } = {},
) {
  return render(
    <ChatTranscript
      hasMoreOlder={false}
      historyErrorMessage={null}
      isConnectionAvailable
      isLoadingOlder={false}
      messages={messages}
      onLoadOlder={vi.fn()}
      onReplyToMessage={onReplyToMessage}
      onRetryTextMessage={vi.fn()}
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

function getMessageMeta(container: HTMLElement, messageId: number) {
  const message = container.querySelector(`[data-message-id="${messageId}"]`)
  const meta = message?.querySelector('[data-message-meta]')

  return meta instanceof HTMLElement ? meta : null
}

function getMessageHeader(container: HTMLElement, messageId: number) {
  const message = container.querySelector(`[data-message-id="${messageId}"]`)
  const header = message?.querySelector('[data-message-header]')

  return header instanceof HTMLElement ? header : null
}

function getSwipeSurface(container: HTMLElement, messageId: number) {
  const message = container.querySelector(`[data-message-id="${messageId}"]`)
  const swipeSurface = message?.querySelector('[data-message-swipe-surface]')

  if (!(swipeSurface instanceof HTMLElement)) {
    throw new Error(`Missing message swipe surface ${messageId}.`)
  }

  return swipeSurface
}

describe('ChatTranscript', () => {
  it('groups outgoing bubbles and renders metadata on minute boundaries', () => {
    const { container } = renderTranscript([
      createMessage({
        content: 'Первое мое сообщение',
        createdAt: '2026-04-21T10:00:00',
        id: 1,
      }),
      createMessage({
        content: 'Второе мое сообщение',
        createdAt: '2026-04-21T10:00:30',
        id: 2,
      }),
      createMessage({
        content: 'Последнее мое сообщение',
        createdAt: '2026-04-21T10:01:00',
        id: 3,
      }),
    ])

    expect(screen.queryByText(/AM|PM|Apr/)).not.toBeInTheDocument()
    expect(screen.getAllByText('Вы')).toHaveLength(2)

    const dayDividerLabel = screen.getByText('21 апреля')
    expect(dayDividerLabel).toHaveClass(
      'border-brand-100',
      'bg-brand-50',
      'text-brand-700',
    )
    expect(dayDividerLabel.parentElement).toHaveClass('max-w-[520px]', 'gap-3')

    expect(container.querySelector('[data-agent-avatar]')).toBeNull()
    expect(getBubble(container, 1)).toHaveClass(
      'rounded-[0.9rem]',
      'rounded-tr-[0.4rem]',
    )
    expect(getBubble(container, 1)).toHaveClass('bg-brand-800', 'text-white')
    expect(getBubble(container, 2)).toHaveClass('rounded-[0.9rem]')
    expect(getBubble(container, 2)).not.toHaveClass('rounded-tr-[0.4rem]')
    expect(getBubble(container, 3)).toHaveClass('rounded-[0.9rem]')
    const firstMinuteHeader = getMessageHeader(container, 1)
    const sameMinuteHeader = getMessageHeader(container, 2)
    const secondMinuteHeader = getMessageHeader(container, 3)
    const firstMinuteMeta = getMessageMeta(container, 2)
    const secondMinuteMeta = getMessageMeta(container, 3)

    expect(firstMinuteHeader?.children[0]).toHaveTextContent('10:00')
    expect(firstMinuteHeader?.children[1]).toHaveTextContent('Вы')
    expect(sameMinuteHeader).toBeNull()
    expect(secondMinuteHeader?.children[0]).toHaveTextContent('10:01')
    expect(secondMinuteHeader?.children[1]).toHaveTextContent('Вы')
    expect(getMessageMeta(container, 1)).toBeNull()
    expect(firstMinuteMeta).toHaveClass('justify-end')
    expect(firstMinuteMeta).not.toHaveTextContent('10:00')
    expect(firstMinuteMeta).toHaveTextContent('Доставлено')
    expect(getMessageMeta(container, 3)).not.toHaveTextContent('10:01')
    expect(secondMinuteMeta).toHaveTextContent('Доставлено')
    expect(getBubble(container, 2)).not.toContainElement(firstMinuteMeta)
  })

  it('renders an agent avatar on the first incoming bubble in a group', () => {
    const { container } = renderTranscript([
      createMessage({
        authorAvatarUrl: 'https://chatwoot.example.test/agent-avatar.png',
        authorName: 'Ольга Support',
        content: 'Первый ответ агента',
        createdAt: '2026-04-21T10:00:00',
        direction: 'incoming',
        id: 1,
      }),
      createMessage({
        authorAvatarUrl: 'https://chatwoot.example.test/agent-avatar.png',
        authorName: 'Ольга Support',
        content: 'Последний ответ агента',
        createdAt: '2026-04-21T10:01:00',
        direction: 'incoming',
        id: 2,
      }),
    ])

    expect(getMessageHeader(container, 1)?.children[0]).toHaveTextContent(
      'Ольга Support',
    )
    expect(getMessageHeader(container, 1)?.children[1]).toHaveTextContent(
      '10:00',
    )
    expect(getMessageHeader(container, 2)?.children[0]).toHaveTextContent(
      'Ольга Support',
    )
    expect(getMessageHeader(container, 2)?.children[1]).toHaveTextContent(
      '10:01',
    )
    expect(getMessageMeta(container, 1)).toBeNull()
    expect(getMessageMeta(container, 2)).toBeNull()
    const avatars = container.querySelectorAll('[data-agent-avatar]')
    expect(avatars).toHaveLength(1)
    expect(avatars[0]).toHaveAttribute('aria-label', 'Агент Ольга Support')
    expect(avatars[0]).not.toHaveTextContent('ОS')
    expect(avatars[0]?.querySelector('img')).toHaveAttribute(
      'src',
      'https://chatwoot.example.test/agent-avatar.png',
    )
    expect(getBubble(container, 1)).toHaveClass(
      'rounded-[0.9rem]',
      'rounded-tl-[0.4rem]',
    )
    expect(getBubble(container, 1)).toHaveClass('bg-white', 'text-slate-700')
    expect(getBubble(container, 2)).toHaveClass('rounded-[0.9rem]')
    expect(getBubble(container, 2)).not.toHaveClass('rounded-tl-[0.4rem]')
  })

  it('renders reply previews inside bubbles without persistent reply buttons', () => {
    renderTranscript([
      createMessage({
        authorName: 'Ольга Support',
        content: 'Подпишите акт, пожалуйста.',
        direction: 'incoming',
        id: 1,
      }),
      createMessage({
        content: '👍 Ок',
        id: 2,
        replyTo: {
          attachmentName: null,
          authorName: 'Ольга Support',
          content: 'Подпишите акт, пожалуйста.',
          direction: 'incoming',
          messageId: 1,
        },
      }),
    ])

    expect(
      screen.getByText('Ответ на сообщение Ольга Support'),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Подпишите акт, пожалуйста.')).toHaveLength(2)
    expect(
      screen.queryByRole('button', { name: /Ответить на сообщение/ }),
    ).not.toBeInTheDocument()
  })

  it('renders audio attachments with playback controls', () => {
    renderTranscript([
      createMessage({
        attachments: [
          {
            fileSize: 24576,
            fileType: 'audio',
            id: 9,
            name: 'voice-message.webm',
            thumbUrl: '',
            url: 'https://files.example.test/voice-message.webm',
          },
        ],
        content: null,
        id: 2,
      }),
    ])

    const audio = screen.getByLabelText(
      'Голосовое сообщение voice-message.webm',
    )

    expect(audio).toHaveAttribute(
      'src',
      'https://files.example.test/voice-message.webm',
    )
    expect(audio).toHaveAttribute('controls')
  })

  it('opens a desktop context menu for reply actions', () => {
    const onReplyToMessage = vi.fn()
    const { container } = renderTranscript(
      [
        createMessage({
          content: 'Сообщение для ответа',
          id: 2,
        }),
      ],
      {
        onReplyToMessage,
      },
    )

    fireEvent.contextMenu(getBubble(container, 2), {
      clientX: 120,
      clientY: 160,
    })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ответить' }))

    expect(onReplyToMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 2,
      }),
    )
  })

  it('copies message text from the desktop context menu', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText,
      },
    })

    const { container } = renderTranscript([
      createMessage({
        content: 'Текст для копирования',
        id: 2,
      }),
    ])

    fireEvent.contextMenu(getBubble(container, 2), {
      clientX: 120,
      clientY: 160,
    })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Копировать' }))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('Текст для копирования')
    })
  })

  it('selects a reply target with a left swipe on touch devices', () => {
    const onReplyToMessage = vi.fn()
    const { container } = renderTranscript(
      [
        createMessage({
          content: 'Сообщение для свайпа',
          id: 2,
        }),
      ],
      {
        onReplyToMessage,
      },
    )
    const swipeSurface = getSwipeSurface(container, 2)

    fireEvent.pointerDown(swipeSurface, {
      button: 0,
      clientX: 220,
      clientY: 120,
      pointerId: 1,
      pointerType: 'touch',
    })
    fireEvent.pointerMove(swipeSurface, {
      clientX: 150,
      clientY: 124,
      pointerId: 1,
      pointerType: 'touch',
    })
    fireEvent.pointerUp(swipeSurface, {
      clientX: 150,
      clientY: 124,
      pointerId: 1,
      pointerType: 'touch',
    })

    expect(onReplyToMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 2,
      }),
    )
  })

  it('does not trigger reply when the touch gesture is vertical scrolling', () => {
    const onReplyToMessage = vi.fn()
    const { container } = renderTranscript(
      [
        createMessage({
          content: 'Сообщение рядом с прокруткой',
          id: 2,
        }),
      ],
      {
        onReplyToMessage,
      },
    )
    const swipeSurface = getSwipeSurface(container, 2)

    fireEvent.pointerDown(swipeSurface, {
      button: 0,
      clientX: 220,
      clientY: 120,
      pointerId: 1,
      pointerType: 'touch',
    })
    fireEvent.pointerMove(swipeSurface, {
      clientX: 216,
      clientY: 170,
      pointerId: 1,
      pointerType: 'touch',
    })
    fireEvent.pointerUp(swipeSurface, {
      clientX: 216,
      clientY: 170,
      pointerId: 1,
      pointerType: 'touch',
    })

    expect(onReplyToMessage).not.toHaveBeenCalled()
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
        shouldAutoFollowNewMessages: true,
      }),
    ).toEqual({
      type: 'scroll_to_bottom',
    })
  })

  it('keeps following the bottom when the stored snapshot is stale but the user did not scroll away', () => {
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
          scrollTop: 560,
          wasNearBottom: false,
        },
        shouldAutoFollowNewMessages: true,
      }),
    ).toEqual({
      type: 'scroll_to_bottom',
    })
  })

  it('does not pull the user down for incoming messages after they scroll up', () => {
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
          scrollTop: 240,
          wasNearBottom: false,
        },
        shouldAutoFollowNewMessages: false,
      }),
    ).toEqual({
      type: 'none',
    })
  })

  it('keeps the bottom pinned when the latest visible message grows in place', () => {
    expect(
      getTranscriptScrollAction({
        currentBoundary: {
          firstMessageId: 1,
          lastMessageId: 2,
          latestMessageDirection: 'incoming',
          messageCount: 2,
        },
        currentScrollHeight: 1180,
        previousSnapshot: {
          clientHeight: 320,
          firstMessageId: 1,
          lastMessageId: 2,
          latestMessageDirection: 'incoming',
          messageCount: 2,
          scrollHeight: 1000,
          scrollTop: 680,
          wasNearBottom: true,
        },
        shouldAutoFollowNewMessages: true,
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
        shouldAutoFollowNewMessages: false,
      }),
    ).toEqual({
      nextScrollTop: 720,
      type: 'preserve_prepend',
    })
  })
})
