import { act, fireEvent, render, waitFor } from '@testing-library/react'
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
    onLatestEdgeChange = vi.fn(),
    onLatestMessagesVisible = vi.fn(),
  }: {
    onLatestEdgeChange?: (isAtLatestEdge: boolean) => void
    onLatestMessagesVisible?: (boundary: {
      latestVisibleAgentMessageId: number | null
    }) => void
  } = {},
) {
  return render(
    <ChatTranscript
      hasMoreOlder={false}
      historyErrorMessage={null}
      isConnectionAvailable
      isLoadingOlder={false}
      messages={messages}
      onLatestEdgeChange={onLatestEdgeChange}
      onLatestMessagesVisible={onLatestMessagesVisible}
      onLoadOlder={vi.fn()}
      onReplyToMessage={vi.fn()}
      onRetryTextMessage={vi.fn()}
    />,
  )
}

class ControllableResizeObserver {
  static instances: ControllableResizeObserver[] = []

  private readonly callback: ResizeObserverCallback
  private readonly observedElements = new Set<Element>()

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    ControllableResizeObserver.instances.push(this)
  }

  observe(element: Element) {
    this.observedElements.add(element)
  }

  disconnect() {
    this.observedElements.clear()
  }

  unobserve(element: Element) {
    this.observedElements.delete(element)
  }

  trigger(element: Element) {
    if (!this.observedElements.has(element)) {
      return
    }

    this.callback(
      [
        {
          target: element,
        } as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    )
  }
}

describe('ChatTranscript viewport reporting', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    ControllableResizeObserver.instances = []
  })

  it('rechecks latest visible messages when the app returns to foreground', async () => {
    const onLatestMessagesVisible = vi.fn()

    renderTranscript(
      [
        createMessage({
          authorName: 'Ольга Support',
          authorRole: 'agent',
          content: 'Проверьте новый документ.',
          direction: 'incoming',
          id: 101,
        }),
      ],
      { onLatestMessagesVisible },
    )

    await waitFor(() => {
      expect(onLatestMessagesVisible).toHaveBeenCalledWith({
        latestVisibleAgentMessageId: 101,
      })
    })

    onLatestMessagesVisible.mockClear()

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(onLatestMessagesVisible).toHaveBeenCalledWith({
      latestVisibleAgentMessageId: 101,
    })
  })

  it('reports whether the transcript is at the latest bottom edge', async () => {
    const onLatestEdgeChange = vi.fn()
    const { container } = renderTranscript(
      [
        createMessage({
          content: 'Старое сообщение',
          id: 1,
        }),
        createMessage({
          content: 'Последнее сообщение',
          id: 2,
        }),
      ],
      { onLatestEdgeChange },
    )

    await waitFor(() => {
      expect(onLatestEdgeChange).toHaveBeenCalledWith(true)
    })

    const scrollElement = container.querySelector<HTMLElement>(
      'section.chat-scroll',
    )
    expect(scrollElement).not.toBeNull()

    Object.defineProperty(scrollElement, 'clientHeight', {
      configurable: true,
      value: 320,
    })
    Object.defineProperty(scrollElement, 'scrollHeight', {
      configurable: true,
      value: 1200,
    })
    Object.defineProperty(scrollElement, 'scrollTop', {
      configurable: true,
      value: 240,
    })

    fireEvent.scroll(scrollElement!)

    expect(onLatestEdgeChange).toHaveBeenCalledWith(false)
  })

  it('keeps the latest message pinned when the transcript viewport height changes at the bottom edge', async () => {
    vi.stubGlobal('ResizeObserver', ControllableResizeObserver)

    const { container } = renderTranscript([
      createMessage({
        content: 'Старое сообщение',
        id: 1,
      }),
      createMessage({
        content: 'Последнее сообщение',
        id: 2,
      }),
    ])
    const scrollElement = container.querySelector<HTMLElement>(
      'section.chat-scroll',
    )

    expect(scrollElement).not.toBeNull()

    let currentScrollTop = 680

    Object.defineProperty(scrollElement, 'clientHeight', {
      configurable: true,
      get: () => 320,
    })
    Object.defineProperty(scrollElement, 'scrollHeight', {
      configurable: true,
      get: () => 1000,
    })
    Object.defineProperty(scrollElement, 'scrollTop', {
      configurable: true,
      get: () => currentScrollTop,
      set: (value: number) => {
        currentScrollTop = value
      },
    })

    await waitFor(() => {
      expect(ControllableResizeObserver.instances).toHaveLength(1)
    })

    currentScrollTop = 680

    act(() => {
      ControllableResizeObserver.instances[0]?.trigger(scrollElement!)
    })

    await waitFor(() => {
      expect(currentScrollTop).toBe(1000)
    })
  })

  it('does not pin the transcript on viewport resize while the user reads history', async () => {
    vi.stubGlobal('ResizeObserver', ControllableResizeObserver)

    const { container } = renderTranscript([
      createMessage({
        content: 'Старое сообщение',
        id: 1,
      }),
      createMessage({
        content: 'Последнее сообщение',
        id: 2,
      }),
    ])
    const scrollElement = container.querySelector<HTMLElement>(
      'section.chat-scroll',
    )

    expect(scrollElement).not.toBeNull()

    let currentScrollTop = 240

    Object.defineProperty(scrollElement, 'clientHeight', {
      configurable: true,
      get: () => 320,
    })
    Object.defineProperty(scrollElement, 'scrollHeight', {
      configurable: true,
      get: () => 1000,
    })
    Object.defineProperty(scrollElement, 'scrollTop', {
      configurable: true,
      get: () => currentScrollTop,
      set: (value: number) => {
        currentScrollTop = value
      },
    })

    await waitFor(() => {
      expect(ControllableResizeObserver.instances).toHaveLength(1)
    })

    currentScrollTop = 240
    fireEvent.scroll(scrollElement!)

    act(() => {
      ControllableResizeObserver.instances[0]?.trigger(scrollElement!)
    })

    expect(currentScrollTop).toBe(240)
  })
})
