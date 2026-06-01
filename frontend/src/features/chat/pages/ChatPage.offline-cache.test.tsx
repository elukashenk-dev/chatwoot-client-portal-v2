import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '../../../app/AppRoutes'
import { renderWithRouter } from '../../../test/renderWithRouter'
import {
  AuthSessionContext,
  type AuthSessionContextValue,
} from '../../auth/lib/authSessionContext'
import { AuthSessionProvider } from '../../auth/lib/AuthSessionProvider'
import { clearOfflineDatabaseForTests } from '../../offline/offlineDatabase'
import { offlineStore } from '../../offline/offlineStore'
import { TenantIdentityContext } from '../../tenant/lib/tenantIdentityContext'
import { ChatPage } from './ChatPage'
import type { ChatMessagesSnapshot, ChatThreadListSummary } from '../types'

const CHAT_PAGE_LOAD_TIMEOUT = {
  timeout: 5000,
}

const tenantContextValue = {
  errorMessage: null,
  isUsingCachedData: false,
  status: 'ready' as const,
  tenant: {
    displayName: 'Бухфирма',
    primaryDomain: 'lk.buhfirma.ru',
    publicBaseUrl: 'https://lk.buhfirma.ru',
    slug: 'buhfirma',
  },
}

const privateThread = {
  id: 'private:me',
  subtitle: 'Вы и поддержка',
  title: 'Личный чат',
  type: 'private',
} satisfies NonNullable<ChatMessagesSnapshot['activeThread']>

const cachedGroupThread = {
  id: 'group:254',
  subtitle: 'Групповой чат',
  title: 'Отключенная группа',
  type: 'group',
} satisfies NonNullable<ChatMessagesSnapshot['activeThread']>

const privateThreadList = {
  ...privateThread,
  unreadCount: 0,
}

const cachedGroupThreadList = {
  ...cachedGroupThread,
  unreadCount: 0,
}

const cachedAuthUser = {
  email: 'name@company.ru',
  fullName: 'Portal User',
  id: 7,
}

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
      email: 'name@company.ru',
      fullName: 'Portal User',
      id: 7,
    },
  })
}

function createThreadsResponse() {
  return {
    activeThreadId: privateThread.id,
    threads: [privateThreadList],
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

function saveStartupChatFallback({
  savedAt = '2026-05-27T10:00:00.000Z',
  selectedThreadId = privateThread.id,
  snapshot = createReadySnapshot(),
  threads = [privateThreadList],
}: {
  savedAt?: string
  selectedThreadId?: string
  snapshot?: ChatMessagesSnapshot
  threads?: ChatThreadListSummary[]
} = {}) {
  window.localStorage.setItem(
    `portal.startup.chat:${window.location.host}:buhfirma:7`,
    JSON.stringify({
      record: {
        cachedSavedAt: savedAt,
        host: window.location.host,
        selectedThreadId,
        snapshot,
        tenantSlug: 'buhfirma',
        threads,
        userId: 7,
      },
      version: 1,
    }),
  )
}

function renderChatRoute() {
  renderWithRouter(
    <TenantIdentityContext.Provider value={tenantContextValue}>
      <AuthSessionProvider>
        <AppRoutes />
      </AuthSessionProvider>
    </TenantIdentityContext.Provider>,
    { initialEntries: ['/app/chat'] },
  )
}

function renderChatPageWithCachedAuth() {
  const authContextValue = {
    errorMessage: null,
    localDeviceDataRemovalAvailable: true,
    refreshSession: vi.fn(async () => undefined),
    removeLocalDeviceData: vi.fn(async () => undefined),
    sessionSource: 'cached',
    signIn: vi.fn(async () => cachedAuthUser),
    signOut: vi.fn(async () => undefined),
    status: 'authenticated',
    user: cachedAuthUser,
  } satisfies AuthSessionContextValue

  renderWithRouter(
    <TenantIdentityContext.Provider value={tenantContextValue}>
      <AuthSessionContext.Provider value={authContextValue}>
        <ChatPage />
      </AuthSessionContext.Provider>
    </TenantIdentityContext.Provider>,
    { initialEntries: ['/app/chat'] },
  )
}

function createHangingFetch(signal?: AbortSignal | null) {
  return new Promise<Response>((_resolve, reject) => {
    signal?.addEventListener(
      'abort',
      () => {
        reject(new DOMException('Request timed out.', 'AbortError'))
      },
      { once: true },
    )
  })
}

function createDeferred<TValue>() {
  let resolveValue!: (value: TValue) => void
  const promise = new Promise<TValue>((resolve) => {
    resolveValue = resolve
  })

  return {
    promise,
    resolve: resolveValue,
  }
}

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
