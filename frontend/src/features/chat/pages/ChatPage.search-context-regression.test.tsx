import { act, fireEvent, screen, waitFor } from '@testing-library/react'
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
  targetMessageId = 190,
}: {
  messages?: ChatMessagesSnapshot['messages']
  targetMessageId?: number
} = {}) {
  return {
    activeThread: privateThread,
    earlierCursor: 188,
    hasMoreEarlier: true,
    hasMoreLater: true,
    laterCursor: 191,
    messages,
    reason: 'none',
    result: 'ready',
    targetMessageId,
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

describe('ChatPage search context regressions', () => {
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

  it('ignores stale context responses when another search result opens first', async () => {
    const user = userEvent.setup()
    const firstContextResponse = createDeferredResponse()
    const secondContextResponse = createDeferredResponse()

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
        return createJsonResponse({
          ...createOldSearchResponse(),
          items: [
            {
              ...createOldSearchResponse().items[0],
              content: 'Первый старый договор.',
              id: 'message:190',
              messageId: 190,
            },
            {
              ...createOldSearchResponse().items[0],
              content: 'Второй старый договор.',
              id: 'message:195',
              messageId: 195,
            },
          ],
        })
      }

      if (
        url === '/api/chat/threads/private%3Ame/messages/context?messageId=190'
      ) {
        return firstContextResponse.promise
      }

      if (
        url === '/api/chat/threads/private%3Ame/messages/context?messageId=195'
      ) {
        return secondContextResponse.promise
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

    fireEvent.click(openPlaceButtons[1]!)
    fireEvent.click(openPlaceButtons[2]!)

    await waitFor(() => {
      expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain(
        '/api/chat/threads/private%3Ame/messages/context?messageId=195',
      )
    })

    await act(async () => {
      secondContextResponse.resolve(
        createJsonResponse(
          createContextResponse({
            messages: [
              {
                attachments: [],
                authorName: 'Ольга Support',
                authorRole: 'agent',
                content: 'Второй старый договор в контексте.',
                contentType: 'text',
                createdAt: '2026-02-12T06:20:00.000Z',
                direction: 'incoming',
                id: 195,
                status: 'sent',
              },
            ],
            targetMessageId: 195,
          }),
        ),
      )
    })

    expect(
      await screen.findByText('Показан фрагмент истории'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Второй старый договор в контексте.'),
    ).toBeInTheDocument()

    await act(async () => {
      firstContextResponse.resolve(
        createJsonResponse(
          createContextResponse({
            messages: [
              {
                attachments: [],
                authorName: 'Ольга Support',
                authorRole: 'agent',
                content: 'Первый старый договор в контексте.',
                contentType: 'text',
                createdAt: '2026-02-12T06:14:00.000Z',
                direction: 'incoming',
                id: 190,
                status: 'sent',
              },
            ],
            targetMessageId: 190,
          }),
        ),
      )
    })

    await waitFor(() => {
      expect(
        screen.getByText('Второй старый договор в контексте.'),
      ).toBeInTheDocument()
      expect(
        screen.queryByText('Первый старый договор в контексте.'),
      ).not.toBeInTheDocument()
    })
  })

  it('returns from a history fragment when a loaded latest search result is selected', async () => {
    const user = userEvent.setup()
    let searchCount = 0

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
        searchCount += 1

        return createJsonResponse(
          searchCount === 1
            ? createOldSearchResponse()
            : createSearchResponse(),
        )
      }

      if (
        url === '/api/chat/threads/private%3Ame/messages/context?messageId=190'
      ) {
        return createJsonResponse(createContextResponse())
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
    const oldResultOpenButtons = await screen.findAllByRole('button', {
      name: 'Открыть место в чате',
    })

    await user.click(oldResultOpenButtons[oldResultOpenButtons.length - 1]!)

    expect(
      await screen.findByText('Показан фрагмент истории'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Вот тот самый договор, который вы искали.'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Открыть меню чата' }))
    await user.click(screen.getByRole('menuitem', { name: 'Поиск по чату' }))
    fireEvent.change(
      await screen.findByLabelText('Поиск по чату', {}, CHAT_PAGE_LOAD_TIMEOUT),
      {
        target: { value: 'договор' },
      },
    )
    const latestResultOpenButtons = await screen.findAllByRole('button', {
      name: 'Открыть место в чате',
    })

    await user.click(latestResultOpenButtons[0]!)

    await waitFor(() => {
      expect(
        screen.queryByText('Показан фрагмент истории'),
      ).not.toBeInTheDocument()
    })
    expect(screen.getByText('Договор готов к подписанию.')).toBeInTheDocument()
    expect(
      document.querySelector('[data-message-highlighted="true"]'),
    ).toBeInTheDocument()
  })

  it('retargets an open history fragment when another search result is already loaded there', async () => {
    const user = userEvent.setup()
    let searchCount = 0

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
        searchCount += 1

        return createJsonResponse({
          ...createOldSearchResponse(),
          items:
            searchCount === 1
              ? [
                  {
                    ...createOldSearchResponse().items[0],
                    content: 'Первая задача во фрагменте.',
                    id: 'message:190',
                    messageId: 190,
                  },
                ]
              : [
                  {
                    ...createOldSearchResponse().items[0],
                    content: 'Вторая задача во фрагменте.',
                    id: 'message:195',
                    messageId: 195,
                  },
                ],
        })
      }

      if (
        url === '/api/chat/threads/private%3Ame/messages/context?messageId=190'
      ) {
        return createJsonResponse(
          createContextResponse({
            messages: [
              {
                attachments: [],
                authorName: 'Ольга Support',
                authorRole: 'agent',
                content: 'Первая задача во фрагменте.',
                contentType: 'text',
                createdAt: '2026-02-12T06:14:00.000Z',
                direction: 'incoming',
                id: 190,
                status: 'sent',
              },
              {
                attachments: [],
                authorName: 'Ольга Support',
                authorRole: 'agent',
                content: 'Вторая задача во фрагменте.',
                contentType: 'text',
                createdAt: '2026-02-12T06:20:00.000Z',
                direction: 'incoming',
                id: 195,
                status: 'sent',
              },
            ],
            targetMessageId: 190,
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
        target: { value: 'задача 22' },
      },
    )
    const firstResultOpenButtons = await screen.findAllByRole('button', {
      name: 'Открыть место в чате',
    })

    await user.click(firstResultOpenButtons[firstResultOpenButtons.length - 1]!)

    expect(
      await screen.findByText('Показан фрагмент истории'),
    ).toBeInTheDocument()
    expect(
      document.querySelector(
        '[data-message-id="190"][data-message-highlighted="true"]',
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Открыть меню чата' }))
    await user.click(screen.getByRole('menuitem', { name: 'Поиск по чату' }))
    fireEvent.change(
      await screen.findByLabelText('Поиск по чату', {}, CHAT_PAGE_LOAD_TIMEOUT),
      {
        target: { value: 'задача 32' },
      },
    )
    const secondResultOpenButtons = await screen.findAllByRole('button', {
      name: 'Открыть место в чате',
    })

    await user.click(
      secondResultOpenButtons[secondResultOpenButtons.length - 1]!,
    )

    expect(
      document.querySelector(
        '[data-message-id="195"][data-message-highlighted="true"]',
      ),
    ).toBeInTheDocument()
    expect(
      document.querySelector(
        '[data-message-id="190"][data-message-highlighted="true"]',
      ),
    ).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toContain(
      '/api/chat/threads/private%3Ame/messages/context?messageId=195',
    )
  })

  it('returns from a history fragment when an attachment send starts', async () => {
    const user = userEvent.setup()
    const attachmentResponse = createDeferredResponse()

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

      if (url === '/api/chat/messages/attachment') {
        return attachmentResponse.promise
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
    const oldResultOpenButtons = await screen.findAllByRole('button', {
      name: 'Открыть место в чате',
    })

    await user.click(oldResultOpenButtons[oldResultOpenButtons.length - 1]!)

    expect(
      await screen.findByText('Показан фрагмент истории'),
    ).toBeInTheDocument()

    const file = new File(['invoice'], 'invoice.pdf', {
      type: 'application/pdf',
    })

    await user.upload(screen.getByLabelText('Файл вложения'), file)
    await user.click(screen.getByRole('button', { name: 'Отправить файл' }))

    await waitFor(() => {
      expect(
        screen.queryByText('Показан фрагмент истории'),
      ).not.toBeInTheDocument()
    })
    expect(screen.getByText('Договор готов к подписанию.')).toBeInTheDocument()

    await act(async () => {
      attachmentResponse.resolve(
        createJsonResponse({
          activeThread: privateThread,
          reason: 'none',
          result: 'ready',
          sentMessage: {
            attachments: [
              {
                fileSize: 7,
                fileType: 'file',
                id: 77,
                name: 'invoice.pdf',
                thumbUrl: '',
                url: '/api/chat/threads/private%3Ame/attachments/77',
              },
            ],
            authorName: 'Вы',
            authorRole: 'current_user',
            content: null,
            contentType: 'text',
            createdAt: '2026-05-20T08:30:00.000Z',
            direction: 'outgoing',
            id: 501,
            status: 'sent',
          },
        }),
      )
    })
  })
})
