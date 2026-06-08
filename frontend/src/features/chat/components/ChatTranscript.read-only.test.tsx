import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ChatMessage } from '../types'
import { ChatTranscript } from './ChatTranscript'

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

function renderTranscript(
  messages: ChatMessage[],
  {
    isReadOnly = true,
    onReplyToMessage = vi.fn(),
    onRetryTextMessage = vi.fn(),
  }: {
    isReadOnly?: boolean
    onReplyToMessage?: (message: ChatMessage) => void
    onRetryTextMessage?: (clientMessageKey: string) => void
  } = {},
) {
  return render(
    <ChatTranscript
      hasMoreOlder={false}
      historyErrorMessage={null}
      isConnectionAvailable
      isLoadingOlder={false}
      isReadOnly={isReadOnly}
      messages={messages}
      onLoadOlder={vi.fn()}
      onReplyToMessage={onReplyToMessage}
      onRetryTextMessage={onRetryTextMessage}
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

function getSwipeSurface(container: HTMLElement, messageId: number) {
  const message = container.querySelector(`[data-message-id="${messageId}"]`)
  const swipeSurface = message?.querySelector('[data-message-swipe-surface]')

  if (!(swipeSurface instanceof HTMLElement)) {
    throw new Error(`Missing message swipe surface ${messageId}.`)
  }

  return swipeSurface
}

function stubCoarsePointer() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: query.includes('pointer: coarse'),
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  )
}

describe('ChatTranscript read-only mode', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps default runtime retry and action behavior enabled', async () => {
    const user = userEvent.setup()
    const onRetryTextMessage = vi.fn()

    renderTranscript(
      [
        createMessage({
          clientMessageKey: 'portal-send:failed',
          content: 'Сообщение не отправилось',
          id: -1000,
          status: 'failed',
        }),
        createMessage({
          content: 'Обычное отправленное сообщение',
          id: 2,
          status: 'sent',
        }),
      ],
      {
        isReadOnly: false,
        onRetryTextMessage,
      },
    )

    await user.click(screen.getByRole('button', { name: 'Повторить' }))

    expect(onRetryTextMessage).toHaveBeenCalledWith('portal-send:failed')
    expect(
      screen.getByRole('button', { name: /Действия с сообщением/ }),
    ).toBeInTheDocument()
  })

  it('hides retry and message action controls', () => {
    renderTranscript([
      createMessage({
        clientMessageKey: 'portal-send:failed',
        content: 'Сообщение не отправилось',
        id: -1000,
        status: 'failed',
      }),
    ])

    expect(
      screen.queryByRole('button', { name: 'Повторить' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Действия с сообщением/ }),
    ).not.toBeInTheDocument()
  })

  it('does not reveal a context menu through desktop context menu', () => {
    const onReplyToMessage = vi.fn()
    const { container } = renderTranscript(
      [
        createMessage({
          content: 'Сообщение без read-only меню',
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

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
    expect(onReplyToMessage).not.toHaveBeenCalled()
  })

  it('does not reveal action controls through touch tap behavior', () => {
    stubCoarsePointer()

    const { container } = renderTranscript([
      createMessage({
        content: 'Сообщение без touch-действий',
        id: 2,
      }),
    ])

    fireEvent.click(getBubble(container, 2))

    expect(
      screen.queryByRole('button', { name: /Действия с сообщением/ }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('does not trigger swipe reply', () => {
    const onReplyToMessage = vi.fn()
    const { container } = renderTranscript(
      [
        createMessage({
          content: 'Сообщение без read-only свайпа',
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

    expect(onReplyToMessage).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
