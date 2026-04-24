import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '../../../app/AppRoutes'
import { AuthSessionProvider } from '../../auth/lib/AuthSessionProvider'
import { renderWithRouter } from '../../../test/renderWithRouter'
import type { ChatMessagesSnapshot } from '../types'

const CHAT_PAGE_LOAD_TIMEOUT = {
  timeout: 5000,
}

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
      email: 'name@company.ru',
      fullName: 'Portal User',
      id: 7,
    },
  })
}

function createReadySnapshot(
  overrides: Partial<ChatMessagesSnapshot> = {},
): ChatMessagesSnapshot {
  return {
    hasMoreOlder: false,
    linkedContact: {
      id: 42,
    },
    messages: [
      {
        attachments: [],
        authorName: 'Ольга Support',
        content: 'Здравствуйте, вижу ваше обращение.',
        contentType: 'text',
        createdAt: '2026-04-21T09:12:00.000Z',
        direction: 'incoming',
        id: 101,
        status: 'sent',
      },
    ],
    nextOlderCursor: null,
    primaryConversation: {
      assigneeName: 'Ольга Support',
      id: 77,
      inboxId: 9,
      lastActivityAt: 1776762960,
      status: 'open',
    },
    reason: 'none',
    result: 'ready',
    ...overrides,
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

describe('ChatPage optimistic text send', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('clears the composer immediately and replaces the pending bubble after backend confirmation', async () => {
    const user = userEvent.setup()
    const sendResponse = createDeferredResponse()

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
      .mockReturnValueOnce(sendResponse.promise)

    renderChatRoute()

    await screen.findByText(
      'Здравствуйте, вижу ваше обращение.',
      {},
      CHAT_PAGE_LOAD_TIMEOUT,
    )
    const textarea = screen.getByRole('textbox', { name: 'Сообщение' })

    await user.type(textarea, 'Новое сообщение')
    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(textarea).toHaveValue('')
    expect(screen.getByText('Новое сообщение')).toBeInTheDocument()
    expect(screen.getByText('Отправка')).toBeInTheDocument()
    await waitFor(() => {
      expect(textarea).toHaveFocus()
    })

    await act(async () => {
      sendResponse.resolve(
        createJsonResponse({
          linkedContact: {
            id: 42,
          },
          primaryConversation: {
            assigneeName: 'Ольга Support',
            id: 77,
            inboxId: 9,
            lastActivityAt: 1776763600,
            status: 'open',
          },
          reason: 'none',
          result: 'ready',
          sentMessage: {
            attachments: [],
            authorName: 'Вы',
            content: 'Новое сообщение',
            contentType: 'text',
            createdAt: '2026-04-21T09:30:00.000Z',
            direction: 'outgoing',
            id: 501,
            status: 'sent',
          },
        }),
      )
    })

    await waitFor(() => {
      expect(screen.queryByText('Отправка')).not.toBeInTheDocument()
    })

    const [, requestOptions] = fetchMock.mock.calls[2] ?? []
    const requestBody = JSON.parse(String(requestOptions?.body)) as {
      clientMessageKey: string
      content: string
      primaryConversationId: number
    }

    expect(requestBody).toEqual({
      clientMessageKey: expect.stringMatching(/^portal-send:/),
      content: 'Новое сообщение',
      primaryConversationId: 77,
    })
  })

  it('retries a failed optimistic send with the same client message key', async () => {
    const user = userEvent.setup()

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            error: {
              code: 'chatwoot_unavailable',
              message: 'Chatwoot temporarily unavailable.',
            },
          },
          503,
        ),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          linkedContact: {
            id: 42,
          },
          primaryConversation: {
            assigneeName: 'Ольга Support',
            id: 77,
            inboxId: 9,
            lastActivityAt: 1776763600,
            status: 'open',
          },
          reason: 'none',
          result: 'ready',
          sentMessage: {
            attachments: [],
            authorName: 'Вы',
            content: 'Повтор после сбоя',
            contentType: 'text',
            createdAt: '2026-04-21T09:31:00.000Z',
            direction: 'outgoing',
            id: 502,
            status: 'sent',
          },
        }),
      )

    renderChatRoute()

    await screen.findByText(
      'Здравствуйте, вижу ваше обращение.',
      {},
      CHAT_PAGE_LOAD_TIMEOUT,
    )
    await user.type(
      screen.getByRole('textbox', { name: 'Сообщение' }),
      'Повтор после сбоя',
    )
    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(screen.getByRole('textbox', { name: 'Сообщение' })).toHaveValue('')
    expect(await screen.findByText('Не отправлено')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Повторить' }))

    await waitFor(() => {
      expect(screen.queryByText('Не отправлено')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Повтор после сбоя')).toBeInTheDocument()

    const firstRequestBody = JSON.parse(
      String(fetchMock.mock.calls[2]?.[1]?.body),
    ) as { clientMessageKey: string }
    const retryRequestBody = JSON.parse(
      String(fetchMock.mock.calls[3]?.[1]?.body),
    ) as { clientMessageKey: string }

    expect(retryRequestBody.clientMessageKey).toBe(
      firstRequestBody.clientMessageKey,
    )
  })
})
