import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { offlineStore } from '../../offline/offlineStore'
import { setupOfflineChatTestEnvironment } from '../../../test/chatPageTestHarness'
import {
  cachedGroupThread,
  cachedGroupThreadList,
  CHAT_PAGE_LOAD_TIMEOUT,
  createAuthenticatedUserResponse,
  createDeferred,
  createJsonResponse,
  createNotificationSettingsResponse,
  createReadySnapshot,
  createSupportAvailabilityResponse,
  createThreadsResponse,
  privateThread,
  privateThreadList,
  renderChatRoute,
} from './ChatPage.offline-cache.testSupport'

function createConfigurationErrorResponse() {
  return createJsonResponse(
    {
      error: {
        code: 'portal_contact_disabled',
        message:
          'Доступ к порталу настроен некорректно. Обратитесь в поддержку.',
      },
    },
    403,
  )
}

function createUpstreamUnavailableResponse() {
  return createJsonResponse(
    {
      error: {
        code: 'chatwoot_unavailable',
        message: 'Сервис поддержки временно недоступен.',
      },
    },
    503,
  )
}

async function saveCachedThread({
  selectedThreadId,
  snapshot,
}: {
  selectedThreadId: string
  snapshot: ReturnType<typeof createReadySnapshot>
}) {
  await offlineStore.saveThreadList({
    activeThreadId: privateThread.id,
    savedAt: '2026-05-27T10:00:00.000Z',
    tenantSlug: 'buhfirma',
    threads: [privateThreadList, cachedGroupThreadList],
    userId: 7,
  })
  await offlineStore.saveMessageSnapshot({
    savedAt: '2026-05-27T10:00:00.000Z',
    snapshot,
    tenantSlug: 'buhfirma',
    threadId: selectedThreadId,
    userId: 7,
  })
}

describe('ChatPage cached authority', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(async () => {
    await setupOfflineChatTestEnvironment()
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    fetchMock.mockReset()
  })

  it('replaces cached startup chat when backend rejects contact authority', async () => {
    const threadsResponse = createDeferred<Response>()

    await saveCachedThread({
      selectedThreadId: privateThread.id,
      snapshot: createReadySnapshot({
        messages: [
          {
            attachments: [],
            authorName: 'Ольга Support',
            authorRole: 'agent',
            content: 'Старый сохранённый личный чат.',
            contentType: 'text',
            createdAt: '2026-05-27T10:00:00.000Z',
            direction: 'incoming',
            id: 501,
            status: 'sent',
          },
        ],
      }),
    })
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return createAuthenticatedUserResponse()
      }

      if (url === '/api/chat/threads') {
        return threadsResponse.promise
      }

      if (url === '/api/chat/support-availability') {
        return createSupportAvailabilityResponse()
      }

      if (url.endsWith('/notification-settings')) {
        return createNotificationSettingsResponse()
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatRoute()

    expect(
      await screen.findByText(
        'Старый сохранённый личный чат.',
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()

    threadsResponse.resolve(createConfigurationErrorResponse())

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Чат не подключён' },
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Старый сохранённый личный чат.'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Повторить' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('status', { name: 'Соединение...' }),
    ).not.toBeInTheDocument()
  }, 10_000)

  it('replaces a cached selected thread when backend rejects contact authority', async () => {
    const groupMessagesResponse = createDeferred<Response>()

    await saveCachedThread({
      selectedThreadId: cachedGroupThread.id,
      snapshot: createReadySnapshot({
        activeThread: cachedGroupThread,
        messages: [
          {
            attachments: [],
            authorName: 'Иван Петров',
            authorRole: 'group_member',
            content: 'Старый сохранённый групповой чат.',
            contentType: 'text',
            createdAt: '2026-05-27T10:00:00.000Z',
            direction: 'incoming',
            id: 502,
            status: 'sent',
          },
        ],
      }),
    })
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return createAuthenticatedUserResponse()
      }

      if (url === '/api/chat/threads') {
        return createJsonResponse({
          ...createThreadsResponse(),
          threads: [privateThreadList, cachedGroupThreadList],
        })
      }

      if (url === '/api/chat/messages?threadId=private%3Ame') {
        return createJsonResponse(createReadySnapshot())
      }

      if (url === '/api/chat/messages?threadId=group%3A254') {
        return groupMessagesResponse.promise
      }

      if (url === '/api/chat/support-availability') {
        return createSupportAvailabilityResponse()
      }

      if (url.endsWith('/notification-settings')) {
        return createNotificationSettingsResponse()
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
    await user.click(
      screen.getByRole('menuitem', { name: /Отключенная группа/i }),
    )

    expect(
      await screen.findByText(
        'Старый сохранённый групповой чат.',
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()

    groupMessagesResponse.resolve(createConfigurationErrorResponse())

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Чат не подключён' },
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Старый сохранённый групповой чат.'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Повторить' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('status', { name: 'Соединение...' }),
    ).not.toBeInTheDocument()
  }, 10_000)

  it('replaces cached chat with a retryable state when backend returns 503', async () => {
    const threadsResponse = createDeferred<Response>()

    await saveCachedThread({
      selectedThreadId: privateThread.id,
      snapshot: createReadySnapshot({
        messages: [
          {
            attachments: [],
            authorName: 'Ольга Support',
            authorRole: 'agent',
            content: 'Кэш перед ответом 503.',
            contentType: 'text',
            createdAt: '2026-05-27T10:00:00.000Z',
            direction: 'incoming',
            id: 503,
            status: 'sent',
          },
        ],
      }),
    })
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return createAuthenticatedUserResponse()
      }

      if (url === '/api/chat/threads') {
        return threadsResponse.promise
      }

      if (url === '/api/chat/support-availability') {
        return createSupportAvailabilityResponse()
      }

      if (url.endsWith('/notification-settings')) {
        return createNotificationSettingsResponse()
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatRoute()

    expect(
      await screen.findByText(
        'Кэш перед ответом 503.',
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()

    threadsResponse.resolve(createUpstreamUnavailableResponse())

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Чат временно недоступен' },
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('Кэш перед ответом 503.')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Повторить' }),
    ).toBeInTheDocument()
  }, 10_000)

  it('replaces a cached selected thread with a retryable state on 503', async () => {
    const groupMessagesResponse = createDeferred<Response>()

    await saveCachedThread({
      selectedThreadId: cachedGroupThread.id,
      snapshot: createReadySnapshot({
        activeThread: cachedGroupThread,
        messages: [
          {
            attachments: [],
            authorName: 'Иван Петров',
            authorRole: 'group_member',
            content: 'Кэш выбранной группы перед ответом 503.',
            contentType: 'text',
            createdAt: '2026-05-27T10:00:00.000Z',
            direction: 'incoming',
            id: 504,
            status: 'sent',
          },
        ],
      }),
    })
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return createAuthenticatedUserResponse()
      }

      if (url === '/api/chat/threads') {
        return createJsonResponse({
          ...createThreadsResponse(),
          threads: [privateThreadList, cachedGroupThreadList],
        })
      }

      if (url === '/api/chat/messages?threadId=private%3Ame') {
        return createJsonResponse(createReadySnapshot())
      }

      if (url === '/api/chat/messages?threadId=group%3A254') {
        return groupMessagesResponse.promise
      }

      if (url === '/api/chat/support-availability') {
        return createSupportAvailabilityResponse()
      }

      if (url.endsWith('/notification-settings')) {
        return createNotificationSettingsResponse()
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
    await user.click(
      screen.getByRole('menuitem', { name: /Отключенная группа/i }),
    )

    expect(
      await screen.findByText(
        'Кэш выбранной группы перед ответом 503.',
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()

    groupMessagesResponse.resolve(createUpstreamUnavailableResponse())

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Чат временно недоступен' },
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Кэш выбранной группы перед ответом 503.'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Повторить' }),
    ).toBeInTheDocument()
  }, 10_000)
})
