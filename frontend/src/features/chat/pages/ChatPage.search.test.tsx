import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '../../../app/AppRoutes'
import { renderWithRouter } from '../../../test/renderWithRouter'
import { AuthSessionProvider } from '../../auth/lib/AuthSessionProvider'
import type { ChatMessagesSnapshot, ChatThreadSearchResponse } from '../types'

const CHAT_PAGE_LOAD_TIMEOUT = {
  timeout: 5000,
}

const privateThread = {
  id: 'private:me',
  subtitle: 'Только вы и поддержка',
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
    threads: [privateThread],
  }
}

function createReadySnapshot(): ChatMessagesSnapshot {
  return {
    activeThread: privateThread,
    hasMoreOlder: false,
    messages: [
      {
        attachments: [],
        authorName: 'Ольга Support',
        authorRole: 'agent',
        content: 'Договор готов к подписанию.',
        contentType: 'text',
        createdAt: '2026-05-20T08:20:00.000Z',
        direction: 'incoming',
        id: 204,
        status: 'sent',
      },
    ],
    nextOlderCursor: null,
    reason: 'none',
    result: 'ready',
  }
}

function createSearchResponse(): ChatThreadSearchResponse {
  return {
    activeThread: privateThread,
    hasMoreOlder: false,
    items: [
      {
        afterSnippet: null,
        authorName: 'Ольга Support',
        authorRole: 'agent',
        beforeSnippet: null,
        content: 'Договор готов к подписанию.',
        createdAt: '2026-05-20T08:20:00.000Z',
        direction: 'incoming',
        id: 'message:204',
        matchRanges: [{ start: 0, end: 7 }],
        messageId: 204,
      },
    ],
    nextOlderCursor: null,
    query: 'договор',
    reason: 'none',
    result: 'ready',
  }
}

function createOldSearchResponse(): ChatThreadSearchResponse {
  return {
    activeThread: privateThread,
    hasMoreOlder: false,
    items: [
      {
        afterSnippet: 'Спасибо, посмотрю сегодня.',
        authorName: 'Яго попугай',
        authorRole: 'agent',
        beforeSnippet: 'Перед этим клиент уточнил условия договора.',
        content: 'Вот тот самый договор, который вы искали.',
        createdAt: '2026-02-12T06:14:00.000Z',
        direction: 'incoming',
        id: 'message:190',
        matchRanges: [{ start: 15, end: 22 }],
        messageId: 190,
      },
    ],
    nextOlderCursor: null,
    query: 'договор',
    reason: 'none',
    result: 'ready',
  }
}

function createContextResponse({
  earlierCursor = 188,
  hasMoreEarlier = true,
  hasMoreLater = true,
  laterCursor = 191,
  messages = [
    {
      attachments: [],
      authorName: 'ДО',
      authorRole: 'agent',
      content: 'Перед этим клиент уточнил условия договора.',
      contentType: 'text',
      createdAt: '2026-02-12T06:12:00.000Z',
      direction: 'incoming',
      id: 188,
      status: 'sent',
    },
    {
      attachments: [],
      authorName: 'Яго попугай',
      authorRole: 'agent',
      content: 'Вот тот самый договор, который вы искали.',
      contentType: 'text',
      createdAt: '2026-02-12T06:14:00.000Z',
      direction: 'incoming',
      id: 190,
      status: 'sent',
    },
    {
      attachments: [],
      authorName: 'Вы',
      authorRole: 'current_user',
      content: 'Спасибо, посмотрю сегодня.',
      contentType: 'text',
      createdAt: '2026-02-12T06:16:00.000Z',
      direction: 'outgoing',
      id: 191,
      status: 'sent',
    },
  ],
}: {
  earlierCursor?: number | null
  hasMoreEarlier?: boolean
  hasMoreLater?: boolean
  laterCursor?: number | null
  messages?: ChatMessagesSnapshot['messages']
} = {}) {
  return {
    activeThread: privateThread,
    earlierCursor,
    hasMoreEarlier,
    hasMoreLater,
    laterCursor,
    messages,
    reason: 'none',
    result: 'ready',
    targetMessageId: 190,
  }
}

function renderChatRoute() {
  renderWithRouter(
    <AuthSessionProvider>
      <AppRoutes />
    </AuthSessionProvider>,
    { initialEntries: ['/app/chat'] },
  )
}

describe('ChatPage search panel', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const scrollIntoView = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    Element.prototype.scrollIntoView = scrollIntoView
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
    scrollIntoView.mockReset()
  })

  it('opens search from the chat menu and highlights a loaded transcript message', async () => {
    const user = userEvent.setup()

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

      if (url.startsWith('/api/chat/threads/private%3Ame/search?')) {
        return createJsonResponse(createSearchResponse())
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatRoute()

    expect(
      await screen.findByText(
        'Договор готов к подписанию.',
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Открыть меню чата' }))
    await user.click(screen.getByRole('menuitem', { name: 'Поиск по чату' }))

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Поиск по чату' },
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Поиск по чату'), {
      target: { value: 'договор' },
    })

    expect(
      await screen.findByRole('button', { name: 'Открыть место в чате' }),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Открыть место в чате' }),
    )

    expect(
      screen.queryByRole('heading', { name: 'Поиск по чату' }),
    ).not.toBeInTheDocument()
    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalled()
    })
    expect(
      document.querySelector('[data-message-highlighted="true"]'),
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chat/threads/private%3Ame/search?q=%D0%B4%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      }),
    )
  })

  it('opens an unloaded search result as a chat history fragment and expands context', async () => {
    const user = userEvent.setup()

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

      if (url.startsWith('/api/chat/threads/private%3Ame/search?')) {
        return createJsonResponse(createOldSearchResponse())
      }

      if (
        url === '/api/chat/threads/private%3Ame/messages/context?messageId=190'
      ) {
        return createJsonResponse(createContextResponse())
      }

      if (
        url ===
        '/api/chat/threads/private%3Ame/messages/context?messageId=190&direction=earlier&cursor=188'
      ) {
        return createJsonResponse(
          createContextResponse({
            earlierCursor: null,
            hasMoreEarlier: false,
            hasMoreLater: false,
            laterCursor: null,
            messages: [
              {
                attachments: [],
                authorName: 'Ольга Support',
                authorRole: 'agent',
                content: 'Еще более ранний контекст.',
                contentType: 'text',
                createdAt: '2026-02-12T06:10:00.000Z',
                direction: 'incoming',
                id: 180,
                status: 'sent',
              },
            ],
          }),
        )
      }

      if (
        url ===
        '/api/chat/threads/private%3Ame/messages/context?messageId=190&direction=later&cursor=191'
      ) {
        return createJsonResponse(
          createContextResponse({
            earlierCursor: null,
            hasMoreEarlier: false,
            hasMoreLater: false,
            laterCursor: null,
            messages: [
              {
                attachments: [],
                authorName: 'Ольга Support',
                authorRole: 'agent',
                content: 'Более поздний контекст.',
                contentType: 'text',
                createdAt: '2026-02-12T06:18:00.000Z',
                direction: 'incoming',
                id: 192,
                status: 'sent',
              },
            ],
          }),
        )
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatRoute()

    expect(
      await screen.findByText(
        'Договор готов к подписанию.',
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Открыть меню чата' }))
    await user.click(screen.getByRole('menuitem', { name: 'Поиск по чату' }))

    fireEvent.change(
      await screen.findByLabelText('Поиск по чату', {}, CHAT_PAGE_LOAD_TIMEOUT),
      {
        target: { value: 'договор' },
      },
    )

    const openPlaceButtons = await screen.findAllByRole('button', {
      name: 'Открыть место в чате',
    })

    await user.click(openPlaceButtons[openPlaceButtons.length - 1]!)

    expect(
      screen.queryByRole('heading', { name: 'Поиск по чату' }),
    ).not.toBeInTheDocument()
    expect(
      await screen.findByText(
        'Показан фрагмент истории',
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Вот тот самый договор, который вы искали.'),
    ).toBeInTheDocument()
    expect(
      document.querySelector('[data-message-highlighted="true"]'),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Показать более ранние' }),
    )
    expect(
      await screen.findByText('Еще более ранний контекст.'),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Показать более поздние' }),
    )
    expect(
      await screen.findByText('Более поздний контекст.'),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'К последним сообщениям' }),
    )

    expect(
      screen.queryByText('Показан фрагмент истории'),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Договор готов к подписанию.')).toBeInTheDocument()
  })
})
