import { act, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChatMessagesSnapshot } from '../types'
import {
  MockEventSource,
  renderChatRoute,
  setupOfflineChatTestEnvironment,
} from '../../../test/chatPageTestHarness'

const privateThread = {
  id: 'private:me',
  subtitle: 'Вы и поддержка',
  title: 'Личный чат',
  type: 'private',
} satisfies NonNullable<ChatMessagesSnapshot['activeThread']>

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  })
}

function createAuthenticatedUserResponse() {
  return createJsonResponse({
    session: {
      expiresAt: '2026-06-10T10:00:00.000Z',
    },
    user: {
      email: 'name@group.ru',
      fullName: 'Portal User',
      id: 7,
    },
  })
}

function createReadySnapshot(
  messages: ChatMessagesSnapshot['messages'],
): ChatMessagesSnapshot {
  return {
    activeThread: privateThread,
    hasMoreOlder: false,
    messages,
    nextOlderCursor: null,
    reason: 'none',
    result: 'ready',
  }
}

function createThreadsResponse() {
  return {
    activeThreadId: privateThread.id,
    threads: [{ ...privateThread, unreadCount: 0 }],
    totalUnreadCount: 0,
  }
}

function createNotificationSettingsResponse() {
  return createJsonResponse({
    effective: {
      newMessagesEnabled: true,
      soundEnabled: true,
    },
    global: {
      newMessagesEnabled: true,
      soundEnabled: true,
    },
    overrides: {
      newMessagesEnabled: null,
      soundEnabled: null,
    },
    threadId: privateThread.id,
  })
}

function createSupportAvailabilityResponse() {
  return createJsonResponse({
    currentStatus: 'online',
    outOfOfficeMessage: null,
    reason: 'none',
    result: 'ready',
    workingHours: {
      enabled: false,
      isWithinWorkingHours: null,
      rows: [],
      timezone: 'UTC',
    },
  })
}

describe('ChatPage realtime fallback', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(async () => {
    await setupOfflineChatTestEnvironment()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    fetchMock.mockReset()
    MockEventSource.instances = []
  })

  it('refreshes the visible transcript when backend realtime goes stale', async () => {
    vi.stubGlobal('EventSource', MockEventSource)
    const oldMessage = {
      attachments: [],
      authorName: 'Ольга Support',
      authorRole: 'agent',
      content: 'Старое сообщение до silent SSE.',
      contentType: 'text',
      createdAt: '2026-04-21T09:12:00.000Z',
      direction: 'incoming',
      id: 101,
      status: 'sent',
    } satisfies ChatMessagesSnapshot['messages'][number]
    const newMessage = {
      attachments: [],
      authorName: 'Ольга Support',
      authorRole: 'agent',
      content: 'Новое сообщение пришло через fallback refresh.',
      contentType: 'text',
      createdAt: '2026-04-21T09:17:00.000Z',
      direction: 'incoming',
      id: 102,
      status: 'sent',
    } satisfies ChatMessagesSnapshot['messages'][number]
    const initialSnapshot = createReadySnapshot([oldMessage])
    const fallbackSnapshot = createReadySnapshot([oldMessage, newMessage])
    let messageGetCallCount = 0
    let resolveInitialMessages: (response: Response) => void = () => {}
    const initialMessagesPromise = new Promise<Response>((resolve) => {
      resolveInitialMessages = resolve
    })

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return createAuthenticatedUserResponse()
      }

      if (url === '/api/chat/threads') {
        return createJsonResponse(createThreadsResponse())
      }

      if (url === '/api/chat/messages?threadId=private%3Ame') {
        messageGetCallCount += 1

        return messageGetCallCount === 1
          ? initialMessagesPromise
          : createJsonResponse(fallbackSnapshot)
      }

      if (url === '/api/chat/threads/private%3Ame/notification-settings') {
        return createNotificationSettingsResponse()
      }

      if (url === '/api/chat/support-availability') {
        return createSupportAvailabilityResponse()
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatRoute()

    await waitFor(() => {
      expect(messageGetCallCount).toBe(1)
    })
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-04T00:00:00.000Z'))

    await act(async () => {
      resolveInitialMessages(createJsonResponse(initialSnapshot))
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByText(oldMessage.content)).toBeInTheDocument()
    expect(MockEventSource.instances).toHaveLength(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000)
    })

    expect(screen.getByText(newMessage.content)).toBeInTheDocument()
    expect(screen.getAllByText(oldMessage.content)).toHaveLength(1)
    expect(
      fetchMock.mock.calls.filter(
        ([url, options]) =>
          String(url) === '/api/chat/messages?threadId=private%3Ame' &&
          options?.method === 'GET',
      ),
    ).toHaveLength(2)
  })
})
