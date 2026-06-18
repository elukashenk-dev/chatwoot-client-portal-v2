import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '../../../app/AppRoutes'
import { renderWithRouter } from '../../../test/renderWithRouter'
import type { ChatMessagesSnapshot } from '../types'

const CHAT_PAGE_LOAD_TIMEOUT = {
  timeout: 5000,
}

const privateThread = {
  id: 'private:me',
  subtitle: 'Вы и поддержка',
  title: 'Личный чат',
  type: 'private',
} satisfies NonNullable<ChatMessagesSnapshot['activeThread']>

const groupThread = {
  id: 'group:154',
  subtitle: 'Групповой чат',
  title: 'ООО "Ромашка"',
  type: 'group',
} satisfies NonNullable<ChatMessagesSnapshot['activeThread']>

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  })
}

function createDeferredResponse() {
  let resolveResponse!: (response: Response) => void
  const promise = new Promise<Response>((resolve) => {
    resolveResponse = resolve
  })

  return {
    promise,
    resolve: resolveResponse,
  }
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

function createThreadsResponse() {
  return {
    activeThreadId: privateThread.id,
    threads: [
      {
        ...privateThread,
        unreadCount: 0,
      },
      {
        ...groupThread,
        unreadCount: 0,
      },
    ],
    totalUnreadCount: 0,
  }
}

function createReadySnapshot(
  overrides: Partial<ChatMessagesSnapshot> = {},
): ChatMessagesSnapshot {
  return {
    activeThread: privateThread,
    hasMoreOlder: false,
    messages: [
      {
        attachments: [],
        authorName: 'Ольга Support',
        authorRole: 'agent',
        content: 'Здравствуйте, вижу ваше обращение.',
        contentType: 'text',
        createdAt: '2026-04-21T09:12:00.000Z',
        direction: 'incoming',
        id: 101,
        status: 'sent',
      },
    ],
    nextOlderCursor: null,
    reason: 'none',
    result: 'ready',
    ...overrides,
  }
}

function renderChatRoute(initialEntry = '/app/chat') {
  renderWithRouter(<AppRoutes />, { initialEntries: [initialEntry] })
}

describe('ChatPage thread selection', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fetchMock.mockReset()
  })

  it('loads available chat threads before loading the selected private transcript', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return createAuthenticatedUserResponse()
      }

      if (url === '/api/chat/threads') {
        return createJsonResponse(createThreadsResponse())
      }

      if (url === '/api/chat/messages?threadId=private%3Ame') {
        return createJsonResponse(createReadySnapshot())
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatRoute()

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/chat/threads',
        expect.objectContaining({
          credentials: 'include',
          method: 'GET',
        }),
      )
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chat/messages?threadId=private%3Ame',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      }),
    )
  })

  it('opens the thread requested by the chat route query parameter', async () => {
    const groupSnapshot = createReadySnapshot({
      activeThread: groupThread,
      messages: [
        {
          attachments: [],
          authorName: 'Иван Петров',
          authorRole: 'group_member',
          content: 'Сообщение из общего чата',
          contentType: 'text',
          createdAt: '2026-05-13T08:00:00.000Z',
          direction: 'incoming',
          id: 714,
          status: 'sent',
        },
      ],
    })

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return createAuthenticatedUserResponse()
      }

      if (url === '/api/chat/threads') {
        return createJsonResponse(createThreadsResponse())
      }

      if (url === '/api/chat/messages?threadId=group%3A154') {
        return createJsonResponse(groupSnapshot)
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatRoute('/app/chat?threadId=group%3A154')

    expect(
      await screen.findByText(
        'Сообщение из общего чата',
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/chat/messages?threadId=private%3Ame',
      expect.anything(),
    )
  })

  it('switches from the private chat to a group chat from the header menu', async () => {
    const groupSnapshot = createReadySnapshot({
      activeThread: groupThread,
      messages: [
        {
          attachments: [],
          authorName: 'Иван Петров',
          authorRole: 'group_member',
          content: 'Сообщение из общего чата',
          contentType: 'text',
          createdAt: '2026-05-13T08:00:00.000Z',
          direction: 'incoming',
          id: 714,
          status: 'sent',
        },
      ],
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
        return createJsonResponse(createReadySnapshot())
      }

      if (url === '/api/chat/messages?threadId=group%3A154') {
        return createJsonResponse(groupSnapshot)
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    const user = userEvent.setup()

    renderChatRoute()

    expect(
      await screen.findByText(
        'Здравствуйте, вижу ваше обращение.',
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Открыть навигацию' }))
    await user.click(screen.getByRole('menuitem', { name: /ООО "Ромашка"/i }))

    expect(
      await screen.findByRole(
        'heading',
        { name: 'ООО "Ромашка"' },
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()
    expect(
      await screen.findByText('Сообщение из общего чата'),
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chat/messages?threadId=group%3A154',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      }),
    )
  })

  it('hides the composer while the selected thread transcript is loading', async () => {
    const groupMessagesResponse = createDeferredResponse()
    const groupSnapshot = createReadySnapshot({
      activeThread: groupThread,
      messages: [
        {
          attachments: [],
          authorName: 'Иван Петров',
          authorRole: 'group_member',
          content: 'Групповой чат загрузился.',
          contentType: 'text',
          createdAt: '2026-05-13T08:00:00.000Z',
          direction: 'incoming',
          id: 714,
          status: 'sent',
        },
      ],
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
        return createJsonResponse(createReadySnapshot())
      }

      if (url === '/api/chat/messages?threadId=group%3A154') {
        return groupMessagesResponse.promise
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    const user = userEvent.setup()

    renderChatRoute()

    expect(
      await screen.findByText(
        'Здравствуйте, вижу ваше обращение.',
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Открыть навигацию' }))
    await user.click(screen.getByRole('menuitem', { name: /ООО "Ромашка"/i }))

    try {
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/chat/messages?threadId=group%3A154',
          expect.objectContaining({
            credentials: 'include',
            method: 'GET',
          }),
        )
      })
      await waitFor(() => {
        expect(
          screen.queryByText('Здравствуйте, вижу ваше обращение.'),
        ).not.toBeInTheDocument()
      })
      expect(
        screen.getByRole('region', { name: 'Загрузка чата' }),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('textbox', { name: 'Сообщение' }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByPlaceholderText('Чат временно недоступен'),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByPlaceholderText('Сообщение...'),
      ).not.toBeInTheDocument()
    } finally {
      groupMessagesResponse.resolve(createJsonResponse(groupSnapshot))
    }

    expect(
      await screen.findByText('Групповой чат загрузился.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: 'Сообщение' }),
    ).toBeInTheDocument()
  })

  it('does not merge stale private history after switching to a group chat', async () => {
    const olderPrivateHistory = createDeferredResponse()
    const privateSnapshot = createReadySnapshot({
      hasMoreOlder: true,
      messages: [
        {
          attachments: [],
          authorName: 'Ольга Support',
          authorRole: 'agent',
          content: 'Последнее личное сообщение.',
          contentType: 'text',
          createdAt: '2026-05-13T08:00:00.000Z',
          direction: 'incoming',
          id: 205,
          status: 'sent',
        },
      ],
      nextOlderCursor: 205,
    })
    const groupSnapshot = createReadySnapshot({
      activeThread: groupThread,
      messages: [
        {
          attachments: [],
          authorName: 'Иван Петров',
          authorRole: 'group_member',
          content: 'Актуальный общий чат.',
          contentType: 'text',
          createdAt: '2026-05-13T08:05:00.000Z',
          direction: 'incoming',
          id: 714,
          status: 'sent',
        },
      ],
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
        return createJsonResponse(privateSnapshot)
      }

      if (
        url === '/api/chat/messages?threadId=private%3Ame&beforeMessageId=205'
      ) {
        return olderPrivateHistory.promise
      }

      if (url === '/api/chat/messages?threadId=group%3A154') {
        return createJsonResponse(groupSnapshot)
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    const user = userEvent.setup()

    renderChatRoute()

    await user.click(
      await screen.findByRole(
        'button',
        { name: 'Загрузить более ранние сообщения' },
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Открыть навигацию' }))
    await user.click(screen.getByRole('menuitem', { name: /ООО "Ромашка"/i }))

    expect(await screen.findByText('Актуальный общий чат.')).toBeInTheDocument()

    olderPrivateHistory.resolve(
      createJsonResponse(
        createReadySnapshot({
          messages: [
            {
              attachments: [],
              authorName: 'Ольга Support',
              authorRole: 'agent',
              content: 'Устаревшая личная история.',
              contentType: 'text',
              createdAt: '2026-05-12T08:00:00.000Z',
              direction: 'incoming',
              id: 120,
              status: 'sent',
            },
          ],
          nextOlderCursor: null,
        }),
      ),
    )

    await waitFor(() => {
      expect(
        screen.queryByText('Устаревшая личная история.'),
      ).not.toBeInTheDocument()
    })
    expect(screen.getByText('Актуальный общий чат.')).toBeInTheDocument()
  })
})
