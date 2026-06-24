import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChatMessagesSnapshot } from '../types'
import {
  MockEventSource,
  MockMediaRecorder,
  renderChatRoute,
  setupOfflineChatTestEnvironment,
} from '../../../test/chatPageTestHarness'
import { offlineStore } from '../../offline/offlineStore'

const CHAT_PAGE_LOAD_TIMEOUT = {
  timeout: 5000,
}

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
  overrides: Partial<ChatMessagesSnapshot> = {},
): ChatMessagesSnapshot {
  return {
    activeThread: privateThread,
    hasMoreOlder: false,
    messages: [],
    nextOlderCursor: null,
    reason: 'none',
    result: 'ready',
    ...overrides,
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

function createReadSyncResponse() {
  return new Response(null, { status: 204 })
}

function hasVisibleIncomingMessage(snapshot: ChatMessagesSnapshot) {
  return snapshot.messages.some((message) => message.direction === 'incoming')
}

describe('ChatPage history loading', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(async () => {
    await setupOfflineChatTestEnvironment()
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    fetchMock.mockReset()
    MockEventSource.instances = []
    MockMediaRecorder.instances = []
    MockMediaRecorder.isTypeSupported.mockClear()
  })

  function mockInitialReadyChatResponses(snapshot: ChatMessagesSnapshot) {
    const mockedFetch = fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(createJsonResponse(createThreadsResponse()))
      .mockResolvedValueOnce(createJsonResponse(snapshot))

    if (hasVisibleIncomingMessage(snapshot)) {
      mockedFetch.mockResolvedValueOnce(createReadSyncResponse())
    }

    return mockedFetch
      .mockResolvedValueOnce(createNotificationSettingsResponse())
      .mockResolvedValueOnce(createSupportAvailabilityResponse())
  }

  it('loads older messages through the bounded history cursor', async () => {
    const user = userEvent.setup()

    mockInitialReadyChatResponses(
      createReadySnapshot({
        hasMoreOlder: true,
        messages: [
          {
            attachments: [],
            authorName: 'Ольга Support',
            authorRole: 'agent',
            content: 'Последнее сообщение.',
            contentType: 'text',
            createdAt: '2026-04-21T10:00:00.000Z',
            direction: 'incoming',
            id: 205,
            status: 'sent',
          },
        ],
        nextOlderCursor: 205,
      }),
    ).mockResolvedValueOnce(
      createJsonResponse(
        createReadySnapshot({
          hasMoreOlder: false,
          messages: [
            {
              attachments: [],
              authorName: 'Вы',
              authorRole: 'current_user',
              content: 'Ранее отправленное сообщение.',
              contentType: 'text',
              createdAt: '2026-04-20T08:00:00.000Z',
              direction: 'outgoing',
              id: 120,
              status: 'sent',
            },
          ],
          nextOlderCursor: null,
        }),
      ),
    )

    renderChatRoute()

    await user.click(
      await screen.findByRole(
        'button',
        {
          name: 'Загрузить более ранние сообщения',
        },
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    )

    expect(
      await screen.findByText('Ранее отправленное сообщение.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Последнее сообщение.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chat/messages?threadId=private%3Ame&beforeMessageId=205',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      }),
    )
  })

  it('keeps the visible transcript when older history loading fails', async () => {
    const user = userEvent.setup()

    mockInitialReadyChatResponses(
      createReadySnapshot({
        hasMoreOlder: true,
        messages: [
          {
            attachments: [],
            authorName: 'Ольга Support',
            authorRole: 'agent',
            content: 'Текущее сообщение остается на экране.',
            contentType: 'text',
            createdAt: '2026-04-21T10:00:00.000Z',
            direction: 'incoming',
            id: 205,
            status: 'sent',
          },
        ],
        nextOlderCursor: 205,
      }),
    ).mockResolvedValueOnce(
      createJsonResponse(
        {
          error: {
            code: 'invalid_history_cursor',
            message: 'History cursor is invalid.',
          },
        },
        400,
      ),
    )

    renderChatRoute()

    await user.click(
      await screen.findByRole(
        'button',
        {
          name: 'Загрузить более ранние сообщения',
        },
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    )

    expect(
      await screen.findByText('Текущее сообщение остается на экране.'),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(
        'Не удалось загрузить более ранние сообщения. Попробуйте еще раз.',
      ),
    ).toBeInTheDocument()
  })

  it('loads cached older messages when an online older history request goes offline', async () => {
    const user = userEvent.setup()

    await offlineStore.saveMessagePage({
      pageCursor: 'before:205',
      savedAt: '2026-05-27T10:00:00.000Z',
      snapshot: createReadySnapshot({
        hasMoreOlder: false,
        messages: [
          {
            attachments: [],
            authorName: 'Вы',
            authorRole: 'current_user',
            content: 'Сохраненная старая страница.',
            contentType: 'text',
            createdAt: '2026-04-20T08:00:00.000Z',
            direction: 'outgoing',
            id: 120,
            status: 'sent',
          },
        ],
        nextOlderCursor: null,
      }),
      tenantSlug: 'buhfirma',
      threadId: privateThread.id,
      userId: 7,
    })
    const latestSnapshot = createReadySnapshot({
      hasMoreOlder: true,
      messages: [
        {
          attachments: [],
          authorName: 'Вы',
          authorRole: 'current_user',
          content: 'Последнее сообщение перед offline.',
          contentType: 'text',
          createdAt: '2026-04-21T10:00:00.000Z',
          direction: 'outgoing',
          id: 205,
          status: 'sent',
        },
      ],
      nextOlderCursor: 205,
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
        return createJsonResponse(latestSnapshot)
      }

      if (
        url === '/api/chat/messages?threadId=private%3Ame&beforeMessageId=205'
      ) {
        throw new TypeError('network down')
      }

      if (url === '/api/chat/threads/private%3Ame/notification-settings') {
        return createNotificationSettingsResponse()
      }

      if (url === '/api/chat/support-availability') {
        return createSupportAvailabilityResponse()
      }

      if (url === '/api/chat/threads/private%3Ame/read') {
        return createReadSyncResponse()
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatRoute()

    expect(
      await screen.findByText(
        'Последнее сообщение перед offline.',
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()
    await user.click(
      await screen.findByRole(
        'button',
        {
          name: 'Загрузить более ранние сообщения',
        },
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    )

    expect(
      await screen.findByText('Сохраненная старая страница.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Последнее сообщение перед offline.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        'Не удалось загрузить более ранние сообщения. Попробуйте еще раз.',
      ),
    ).not.toBeInTheDocument()
  })

  it('does not merge a non-ready older history response into the ready transcript', async () => {
    const user = userEvent.setup()

    mockInitialReadyChatResponses(
      createReadySnapshot({
        hasMoreOlder: true,
        messages: [
          {
            attachments: [],
            authorName: 'Ольга Support',
            authorRole: 'agent',
            content: 'Готовая история остается видимой.',
            contentType: 'text',
            createdAt: '2026-04-21T10:00:00.000Z',
            direction: 'incoming',
            id: 205,
            status: 'sent',
          },
        ],
        nextOlderCursor: 205,
      }),
    ).mockResolvedValueOnce(
      createJsonResponse(
        createReadySnapshot({
          activeThread: null,
          hasMoreOlder: false,
          messages: [],
          nextOlderCursor: null,
          reason: 'thread_invalid',
          result: 'not_ready',
        }),
      ),
    )

    renderChatRoute()

    await user.click(
      await screen.findByRole(
        'button',
        {
          name: 'Загрузить более ранние сообщения',
        },
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    )

    expect(
      await screen.findByText('Готовая история остается видимой.'),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(
        'Не удалось загрузить более ранние сообщения. Попробуйте еще раз.',
      ),
    ).toBeInTheDocument()
  })
})
