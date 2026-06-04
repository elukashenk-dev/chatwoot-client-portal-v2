import { afterEach, describe, expect, it, vi } from 'vitest'

import { openChatRealtime } from './chatRealtimeClient'

class MockEventSource {
  static instances: MockEventSource[] = []

  readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>()
  readonly close = vi.fn()

  constructor() {
    MockEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const listeners = this.listeners.get(type) ?? new Set()
    const callback =
      typeof listener === 'function'
        ? listener
        : listener.handleEvent.bind(listener)

    listeners.add(callback as (event: MessageEvent) => void)
    this.listeners.set(type, listeners)
  }

  emit(type: string, data: unknown = {}) {
    const event = new MessageEvent(type, {
      data: JSON.stringify(data),
    })

    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }
}

const readySnapshot = {
  activeThread: {
    id: 'private:me',
    subtitle: 'Вы и поддержка',
    title: 'Личный чат',
    type: 'private',
  },
  hasMoreOlder: false,
  messages: [],
  nextOlderCursor: null,
  reason: 'none',
  result: 'ready',
} as const

describe('openChatRealtime', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    MockEventSource.instances = []
  })

  it('reports realtime activity for open and snapshot events', () => {
    vi.stubGlobal('EventSource', MockEventSource)
    const onActivity = vi.fn()

    openChatRealtime({
      onActivity,
      onChatState: vi.fn(),
      onMessages: vi.fn(),
      threadId: 'private:me',
    })

    const eventSource = MockEventSource.instances[0]

    eventSource?.emit('open')
    eventSource?.emit('messages', readySnapshot)
    eventSource?.emit('chat-state', readySnapshot)

    expect(onActivity).toHaveBeenCalledTimes(3)
  })

  it('reports EventSource errors without closing the browser retry loop', () => {
    vi.stubGlobal('EventSource', MockEventSource)
    const onError = vi.fn()
    const connection = openChatRealtime({
      onChatState: vi.fn(),
      onError,
      onMessages: vi.fn(),
      threadId: 'private:me',
    })

    const eventSource = MockEventSource.instances[0]
    eventSource?.emit('error')

    expect(onError).toHaveBeenCalledTimes(1)
    expect(eventSource?.close).not.toHaveBeenCalled()

    connection.close()

    expect(eventSource?.close).toHaveBeenCalledTimes(1)
  })
})
