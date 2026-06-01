import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  cachedGroupThread,
  cachedGroupThreadList,
  CHAT_PAGE_LOAD_TIMEOUT,
  createAuthenticatedUserResponse,
  createDeferred,
  createHangingFetch,
  createJsonResponse,
  createNotificationSettingsResponse,
  createReadySnapshot,
  createSupportAvailabilityResponse,
  createThreadsResponse,
  privateThread,
  privateThreadList,
  renderChatPageWithCachedAuth,
  renderChatRoute,
  saveStartupChatFallback,
} from './ChatPage.offline-cache.testSupport'
import { clearOfflineDatabaseForTests } from '../../offline/offlineDatabase'
import { offlineStore } from '../../offline/offlineStore'

describe('ChatPage offline cache', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const originalFetch = globalThis.fetch

  beforeEach(async () => {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    })
    window.localStorage.clear()
    await clearOfflineDatabaseForTests()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: originalFetch,
    })
    window.localStorage.clear()
    fetchMock.mockReset()
  })

  it('opens cached thread list and messages when chat bootstrap is offline', async () => {
    await offlineStore.saveThreadList({
      activeThreadId: privateThread.id,
      savedAt: '2026-05-27T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      threads: [privateThreadList],
      userId: 7,
    })
    await offlineStore.saveMessageSnapshot({
      savedAt: '2026-05-27T10:00:00.000Z',
      snapshot: createReadySnapshot(),
      tenantSlug: 'buhfirma',
      threadId: privateThread.id,
      userId: 7,
    })
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return createAuthenticatedUserResponse()
      }

      if (
        url === '/api/chat/threads' ||
        url === '/api/chat/threads/private%3Ame/notification-settings'
      ) {
        throw new TypeError('network down')
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatRoute()

    expect(
      await screen.findByText(
        'Нет связи. Показываем сохраненные сообщения.',
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Здравствуйте, вижу ваше обращение.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Прикрепить файл' }),
    ).toBeDisabled()
  })

  it('opens cached chat when VPN keeps startup chat requests hanging', async () => {
    await offlineStore.saveThreadList({
      activeThreadId: privateThread.id,
      savedAt: '2026-05-27T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      threads: [privateThreadList],
      userId: 7,
    })
    await offlineStore.saveMessageSnapshot({
      savedAt: '2026-05-27T10:00:00.000Z',
      snapshot: createReadySnapshot(),
      tenantSlug: 'buhfirma',
      threadId: privateThread.id,
      userId: 7,
    })
    fetchMock.mockImplementation((input, init) => {
      const url = String(input)

      if (url === '/api/chat/threads') {
        return createHangingFetch(init?.signal)
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatPageWithCachedAuth()

    expect(
      await screen.findByText(
        'Здравствуйте, вижу ваше обращение.',
        {},
        { timeout: 1000 },
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('status', { name: 'Соединение...' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Открываем кабинет' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Готовим чат')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Нет связи. Показываем сохраненные сообщения.'),
    ).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chat/threads',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('renders startup cached chat on the first render before IndexedDB cache opens', () => {
    saveStartupChatFallback()
    fetchMock.mockImplementation((input, init) => {
      const url = String(input)

      if (url === '/api/chat/threads') {
        return createHangingFetch(init?.signal)
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatPageWithCachedAuth()

    expect(
      screen.getByText('Здравствуйте, вижу ваше обращение.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('status', { name: 'Соединение...' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Нет связи. Показываем сохраненные сообщения.'),
    ).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retargets a stale cached group chat when authoritative startup threads no longer include it', async () => {
    saveStartupChatFallback({
      selectedThreadId: cachedGroupThread.id,
      snapshot: createReadySnapshot({
        activeThread: cachedGroupThread,
        messages: [
          {
            attachments: [],
            authorName: 'Portal User',
            authorRole: 'group_member',
            content: 'Кеш старого отключенного группового чата.',
            contentType: 'text',
            createdAt: '2026-05-27T09:58:00.000Z',
            direction: 'outgoing',
            id: 25401,
            status: 'sent',
          },
        ],
      }),
      threads: [privateThreadList, cachedGroupThreadList],
    })
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/chat/threads') {
        return createJsonResponse(createThreadsResponse())
      }

      if (url === '/api/chat/messages?threadId=private%3Ame') {
        return createJsonResponse(
          createReadySnapshot({
            messages: [
              {
                attachments: [],
                authorName: 'Ольга Support',
                authorRole: 'agent',
                content: 'Актуальный личный чат после проверки доступа.',
                contentType: 'text',
                createdAt: '2026-05-27T10:01:00.000Z',
                direction: 'incoming',
                id: 102,
                status: 'sent',
              },
            ],
          }),
        )
      }

      if (url === '/api/chat/support-availability') {
        return createSupportAvailabilityResponse()
      }

      if (url === '/api/chat/threads/private%3Ame/notification-settings') {
        return createNotificationSettingsResponse()
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatPageWithCachedAuth()

    expect(
      screen.getByText('Кеш старого отключенного группового чата.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Отключенная группа' }),
    ).toBeInTheDocument()

    expect(
      await screen.findByText(
        'Актуальный личный чат после проверки доступа.',
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Личный чат' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Кеш старого отключенного группового чата.'),
    ).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/chat/messages?threadId=group%3A254',
      expect.anything(),
    )
  })

  it('keeps the startup cached group chat selected when it is still available online', async () => {
    saveStartupChatFallback({
      selectedThreadId: cachedGroupThread.id,
      snapshot: createReadySnapshot({
        activeThread: cachedGroupThread,
        messages: [
          {
            attachments: [],
            authorName: 'Portal User',
            authorRole: 'group_member',
            content: 'Кеш последнего открытого группового чата.',
            contentType: 'text',
            createdAt: '2026-05-27T09:58:00.000Z',
            direction: 'outgoing',
            id: 25401,
            status: 'sent',
          },
        ],
      }),
      threads: [privateThreadList, cachedGroupThreadList],
    })
    const groupSnapshot = createReadySnapshot({
      activeThread: cachedGroupThread,
      messages: [
        {
          attachments: [],
          authorName: 'Ольга Support',
          authorRole: 'agent',
          content: 'Актуальный групповой чат после online boot.',
          contentType: 'text',
          createdAt: '2026-05-27T10:02:00.000Z',
          direction: 'incoming',
          id: 25402,
          status: 'sent',
        },
      ],
    })
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/chat/threads') {
        return createJsonResponse({
          activeThreadId: privateThread.id,
          threads: [privateThreadList, cachedGroupThreadList],
          totalUnreadCount: 0,
        })
      }

      if (url === '/api/chat/messages?threadId=group%3A254') {
        return createJsonResponse(groupSnapshot)
      }

      if (url === '/api/chat/support-availability') {
        return createSupportAvailabilityResponse()
      }

      if (url === '/api/chat/threads/group%3A254/notification-settings') {
        return createNotificationSettingsResponse()
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatPageWithCachedAuth()

    expect(
      screen.getByText('Кеш последнего открытого группового чата.'),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(
        'Актуальный групповой чат после online boot.',
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Отключенная группа' }),
    ).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/chat/messages?threadId=private%3Ame',
      expect.anything(),
    )
  })

  it('keeps startup cached chat visible when network fails before IndexedDB fallback is available', async () => {
    saveStartupChatFallback()
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/chat/threads') {
        throw new TypeError('network down')
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatPageWithCachedAuth()

    expect(
      screen.getByText('Здравствуйте, вижу ваше обращение.'),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/chat/threads',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      )
    })
    await waitFor(() => {
      expect(
        screen.getByRole('status', { name: 'Нет связи' }),
      ).toBeInTheDocument()
    })
    expect(
      screen.getByText('Здравствуйте, вижу ваше обращение.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Чат временно недоступен'),
    ).not.toBeInTheDocument()
  })

  it('does not let older IndexedDB fallback overwrite startup cached chat', async () => {
    saveStartupChatFallback({
      savedAt: '2026-05-27T10:05:00.000Z',
      snapshot: createReadySnapshot({
        messages: [
          {
            attachments: [],
            authorName: 'Ольга Support',
            authorRole: 'agent',
            content: 'Свежий startup cache.',
            contentType: 'text',
            createdAt: '2026-04-21T09:15:00.000Z',
            direction: 'incoming',
            id: 202,
            status: 'sent',
          },
        ],
      }),
    })
    await offlineStore.saveThreadList({
      activeThreadId: privateThread.id,
      savedAt: '2026-05-27T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      threads: [privateThreadList],
      userId: 7,
    })
    const staleIndexedDbSnapshot = createReadySnapshot({
      messages: [
        {
          attachments: [],
          authorName: 'Ольга Support',
          authorRole: 'agent',
          content: 'Старый IndexedDB cache.',
          contentType: 'text',
          createdAt: '2026-04-21T09:10:00.000Z',
          direction: 'incoming',
          id: 90,
          status: 'sent',
        },
      ],
    })
    const delayedIndexedDbSnapshot =
      createDeferred<
        Awaited<ReturnType<typeof offlineStore.readMessageSnapshot>>
      >()

    vi.spyOn(offlineStore, 'readMessageSnapshot').mockReturnValueOnce(
      delayedIndexedDbSnapshot.promise,
    )
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/chat/threads') {
        throw new TypeError('network down')
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatPageWithCachedAuth()

    expect(screen.getByText('Свежий startup cache.')).toBeInTheDocument()
    delayedIndexedDbSnapshot.resolve({
      savedAt: '2026-05-27T10:00:00.000Z',
      snapshot: staleIndexedDbSnapshot,
      tenantSlug: 'buhfirma',
      threadId: privateThread.id,
      userId: 7,
    })

    await waitFor(() => {
      expect(
        screen.getByRole('status', { name: 'Нет связи' }),
      ).toBeInTheDocument()
    })
    expect(screen.getByText('Свежий startup cache.')).toBeInTheDocument()
    expect(
      screen.queryByText('Старый IndexedDB cache.'),
    ).not.toBeInTheDocument()
  })

  it('keeps controlled unavailable state when chat bootstrap is offline without cache', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return createAuthenticatedUserResponse()
      }

      if (url === '/api/chat/threads') {
        throw new TypeError('network down')
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatRoute()

    expect(
      await screen.findByText(
        'Чат временно недоступен',
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Нет связи. Показываем сохраненные сообщения.'),
    ).not.toBeInTheDocument()
  })

  it('keeps controlled unavailable state when cached fallback read fails', async () => {
    vi.spyOn(offlineStore, 'readThreadList').mockRejectedValueOnce(
      new Error('IndexedDB read failed'),
    )
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return createAuthenticatedUserResponse()
      }

      if (url === '/api/chat/threads') {
        throw new TypeError('network down')
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatRoute()

    expect(
      await screen.findByText(
        'Чат временно недоступен',
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Нет связи. Показываем сохраненные сообщения.'),
    ).not.toBeInTheDocument()
  })

  it('refreshes thread list and selected messages on reconnect from cached open', async () => {
    const onlineThread = {
      ...privateThread,
      subtitle: 'Обновлено онлайн',
      title: 'Личный чат онлайн',
    }
    await offlineStore.saveThreadList({
      activeThreadId: privateThread.id,
      savedAt: '2026-05-27T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      threads: [privateThreadList],
      userId: 7,
    })
    await offlineStore.saveMessageSnapshot({
      savedAt: '2026-05-27T10:00:00.000Z',
      snapshot: createReadySnapshot(),
      tenantSlug: 'buhfirma',
      threadId: privateThread.id,
      userId: 7,
    })

    let threadRequestCount = 0
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return createAuthenticatedUserResponse()
      }

      if (url === '/api/chat/threads') {
        threadRequestCount += 1

        if (threadRequestCount === 1) {
          throw new TypeError('network down')
        }

        return createJsonResponse({
          activeThreadId: onlineThread.id,
          threads: [
            {
              ...onlineThread,
              unreadCount: 0,
            },
          ],
          totalUnreadCount: 0,
        })
      }

      if (url === '/api/chat/messages?threadId=private%3Ame') {
        return createJsonResponse(
          createReadySnapshot({
            activeThread: onlineThread,
            messages: [
              {
                attachments: [],
                authorName: 'Ольга Support',
                authorRole: 'agent',
                content: 'Онлайн обновление после восстановления связи.',
                contentType: 'text',
                createdAt: '2026-04-21T09:15:00.000Z',
                direction: 'incoming',
                id: 202,
                status: 'sent',
              },
            ],
          }),
        )
      }

      if (url === '/api/chat/support-availability') {
        return createSupportAvailabilityResponse()
      }

      if (url === '/api/chat/threads/private%3Ame/notification-settings') {
        if (threadRequestCount < 2) {
          throw new TypeError('network down')
        }

        return createNotificationSettingsResponse()
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatRoute()

    expect(
      await screen.findByText(
        'Нет связи. Показываем сохраненные сообщения.',
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()

    window.dispatchEvent(new Event('online'))

    expect(
      await screen.findByText(
        'Онлайн обновление после восстановления связи.',
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Личный чат онлайн')).toBeInTheDocument()
    expect(
      screen.queryByText('Нет связи. Показываем сохраненные сообщения.'),
    ).not.toBeInTheDocument()
  })

  it('saves online chat snapshots for later offline open', async () => {
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

      if (url === '/api/chat/support-availability') {
        return createSupportAvailabilityResponse()
      }

      if (url === '/api/chat/threads/private%3Ame/notification-settings') {
        return createNotificationSettingsResponse()
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatRoute()

    expect(
      await screen.findByText(
        'Здравствуйте, вижу ваше обращение.',
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()
    await waitFor(async () => {
      await expect(
        offlineStore.readThreadList('buhfirma', 7),
      ).resolves.toMatchObject({
        activeThreadId: privateThread.id,
        threads: [privateThreadList],
      })
    })
    await waitFor(async () => {
      await expect(
        offlineStore.readMessageSnapshot('buhfirma', 7, privateThread.id),
      ).resolves.toMatchObject({
        snapshot: {
          messages: [expect.objectContaining({ id: 101 })],
        },
      })
    })
  })

  it('does not let delayed cached fallback overwrite a fast online snapshot', async () => {
    const staleCachedSnapshot = createReadySnapshot({
      messages: [
        {
          attachments: [],
          authorName: 'Ольга Support',
          authorRole: 'agent',
          content: 'Старое сохраненное сообщение.',
          contentType: 'text',
          createdAt: '2026-04-21T09:10:00.000Z',
          direction: 'incoming',
          id: 90,
          status: 'sent',
        },
      ],
    })
    const freshOnlineSnapshot = createReadySnapshot({
      messages: [
        {
          attachments: [],
          authorName: 'Ольга Support',
          authorRole: 'agent',
          content: 'Свежий онлайн ответ.',
          contentType: 'text',
          createdAt: '2026-04-21T09:15:00.000Z',
          direction: 'incoming',
          id: 202,
          status: 'sent',
        },
      ],
    })
    const delayedCachedSnapshot =
      createDeferred<
        Awaited<ReturnType<typeof offlineStore.readMessageSnapshot>>
      >()

    await offlineStore.saveThreadList({
      activeThreadId: privateThread.id,
      savedAt: '2026-05-27T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      threads: [privateThreadList],
      userId: 7,
    })
    vi.spyOn(offlineStore, 'readMessageSnapshot').mockReturnValueOnce(
      delayedCachedSnapshot.promise,
    )
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return createAuthenticatedUserResponse()
      }

      if (url === '/api/chat/threads') {
        return createJsonResponse(createThreadsResponse())
      }

      if (url === '/api/chat/messages?threadId=private%3Ame') {
        return createJsonResponse(freshOnlineSnapshot)
      }

      if (url === '/api/chat/support-availability') {
        return createSupportAvailabilityResponse()
      }

      if (url === '/api/chat/threads/private%3Ame/notification-settings') {
        return createNotificationSettingsResponse()
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatRoute()

    expect(
      await screen.findByText(
        'Свежий онлайн ответ.',
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Старое сохраненное сообщение.'),
    ).not.toBeInTheDocument()

    delayedCachedSnapshot.resolve({
      savedAt: '2026-05-27T10:00:00.000Z',
      snapshot: staleCachedSnapshot,
      tenantSlug: 'buhfirma',
      threadId: privateThread.id,
      userId: 7,
    })

    await waitFor(() => {
      expect(
        screen.queryByText('Старое сохраненное сообщение.'),
      ).not.toBeInTheDocument()
    })
    expect(screen.getByText('Свежий онлайн ответ.')).toBeInTheDocument()
  })
})
