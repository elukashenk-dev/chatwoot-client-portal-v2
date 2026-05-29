import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '../../../app/AppRoutes'
import { AuthSessionProvider } from '../../auth/lib/AuthSessionProvider'
import { clearOfflineDatabaseForTests } from '../../offline/offlineDatabase'
import { offlineOutboxStore } from '../../offline/offlineOutboxStore'
import { offlineStore } from '../../offline/offlineStore'
import type { OfflineTextOutboxRecord } from '../../offline/types'
import { TenantIdentityContext } from '../../tenant/lib/tenantIdentityContext'
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

function createThreadsResponse() {
  return {
    activeThreadId: privateThread.id,
    threads: [privateThread],
  }
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

function createAuthenticatedUserResponse(userId = 7) {
  return createJsonResponse({
    session: {
      expiresAt: '2026-06-10T10:00:00.000Z',
    },
    user: {
      email: 'name@group.ru',
      fullName: 'Portal User',
      id: userId,
    },
  })
}

function createDeferredValue<TValue>() {
  let resolveValue!: (value: TValue) => void
  const promise = new Promise<TValue>((resolve) => {
    resolveValue = resolve
  })

  return {
    promise,
    resolve: resolveValue,
  }
}

function createOutboxRecord(
  overrides: Partial<OfflineTextOutboxRecord> = {},
): OfflineTextOutboxRecord {
  return {
    attemptCount: 0,
    clientMessageKey: 'portal-send:test-outbox',
    content: 'Saved queued text',
    createdAt: '2026-05-27T10:00:00.000Z',
    errorCode: null,
    errorMessage: null,
    lastAttemptAt: null,
    nextAttemptAt: null,
    replyTo: null,
    replyToMessageId: null,
    sendOwnerId: null,
    sendingLeaseExpiresAt: null,
    sendingStartedAt: null,
    status: 'queued',
    tenantSlug: 'buhfirma',
    threadId: 'private:me',
    updatedAt: '2026-05-27T10:00:00.000Z',
    userId: 7,
    ...overrides,
  }
}

function createReadySnapshot(
  overrides: Partial<ChatMessagesSnapshot> = {},
): ChatMessagesSnapshot {
  return {
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
    activeThread: privateThread,
    reason: 'none',
    result: 'ready',
    ...overrides,
  }
}

function createNotificationSettingsResponse() {
  return createJsonResponse({
    effective: {
      newMessagesEnabled: true,
      pushEnabled: false,
      soundEnabled: true,
    },
    global: {
      newMessagesEnabled: true,
      pushEnabled: false,
      soundEnabled: true,
    },
    overrides: {
      newMessagesEnabled: null,
      pushEnabled: null,
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

function setNavigatorStorageEstimate({
  quota = 1000,
  usage = 100,
}: {
  quota?: number
  usage?: number
} = {}) {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: {
      estimate: vi.fn(async () => ({
        quota,
        usage,
      })),
      persist: vi.fn(async () => true),
    },
  })
}

function getMessagePostCalls() {
  return fetchMock.mock.calls.filter(
    ([url, options]) =>
      String(url).includes('/api/chat/messages') && options?.method === 'POST',
  )
}

function hasFetchCall(path: string, method = 'GET') {
  return fetchMock.mock.calls.some(
    ([url, options]) =>
      String(url).includes(path) && (options?.method ?? 'GET') === method,
  )
}

async function waitForInitialChatRequests() {
  await waitFor(() => {
    expect(hasFetchCall('/api/auth/me')).toBe(true)
    expect(hasFetchCall('/api/chat/threads')).toBe(true)
    expect(hasFetchCall('/api/chat/messages')).toBe(true)
    expect(hasFetchCall('/notification-settings')).toBe(true)
    expect(hasFetchCall('/api/chat/support-availability')).toBe(true)
  })
}

const fetchMock = vi.fn<typeof fetch>()

describe('ChatPage optimistic text send', () => {
  beforeEach(async () => {
    await clearOfflineDatabaseForTests()
    setNavigatorStorageEstimate()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    fetchMock.mockReset()
  })

  it('queues a durable online text record and lets foreground drain reconcile it', async () => {
    const user = userEvent.setup()
    const sendResponse = createDeferredResponse()

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(createJsonResponse(createThreadsResponse()))
      .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
      .mockResolvedValueOnce(createNotificationSettingsResponse())
      .mockResolvedValueOnce(createSupportAvailabilityResponse())
      .mockReturnValueOnce(sendResponse.promise)

    renderChatRoute()

    await screen.findByText(
      'Здравствуйте, вижу ваше обращение.',
      {},
      CHAT_PAGE_LOAD_TIMEOUT,
    )
    await waitForInitialChatRequests()
    const textarea = screen.getByRole('textbox', { name: 'Сообщение' })

    await user.type(textarea, 'Новое сообщение')
    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(textarea).toHaveValue('')
    expect(screen.getByText('Новое сообщение')).toBeInTheDocument()
    expect(screen.getByLabelText('Отправляется')).toBeInTheDocument()
    expect(screen.queryByText('Отправка')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(getMessagePostCalls()).toHaveLength(1)
    })
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(getMessagePostCalls()).toHaveLength(1)
    await waitFor(() => {
      expect(textarea).toHaveFocus()
    })

    const [, requestOptions] = getMessagePostCalls()[0] ?? []
    const requestBody = JSON.parse(String(requestOptions?.body)) as {
      clientMessageKey: string
      content: string
      threadId: string
    }

    await act(async () => {
      sendResponse.resolve(
        createJsonResponse({
          activeThread: privateThread,
          reason: 'none',
          result: 'ready',
          sentMessage: {
            attachments: [],
            authorName: 'Вы',
            authorRole: 'current_user',
            clientMessageKey: requestBody.clientMessageKey,
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
      expect(screen.queryByLabelText('Отправляется')).not.toBeInTheDocument()
    })

    expect(requestBody).toEqual({
      clientMessageKey: expect.stringMatching(/^portal-send:/),
      content: 'Новое сообщение',
      threadId: 'private:me',
    })
    await expect(
      offlineOutboxStore.readOutboxRecord({
        clientMessageKey: requestBody.clientMessageKey,
        tenantSlug: 'buhfirma',
        threadId: requestBody.threadId,
        userId: 7,
      }),
    ).resolves.toBeNull()
  })

  it('retries a failed durable text record through the outbox drain path', async () => {
    await offlineOutboxStore.saveOutboxRecord(
      createOutboxRecord({
        clientMessageKey: 'portal-send:retry-failed',
        content: 'Retry me',
        errorCode: 'thread_access_denied',
        errorMessage: 'Нет доступа.',
        status: 'failed',
      }),
    )

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(createJsonResponse(createThreadsResponse()))
      .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
      .mockResolvedValueOnce(createNotificationSettingsResponse())
      .mockResolvedValueOnce(createSupportAvailabilityResponse())
      .mockResolvedValueOnce(
        createJsonResponse({
          activeThread: privateThread,
          reason: 'none',
          result: 'ready',
          sentMessage: {
            attachments: [],
            authorName: 'Вы',
            authorRole: 'current_user',
            clientMessageKey: 'portal-send:retry-failed',
            content: 'Retry me',
            contentType: 'text',
            createdAt: '2026-05-27T10:00:02.000Z',
            direction: 'outgoing',
            id: 602,
            status: 'sent',
          },
        }),
      )

    renderChatRoute()

    expect(await screen.findByText('Retry me')).toBeInTheDocument()
    await waitForInitialChatRequests()
    expect(screen.getByLabelText('Не отправлено')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))

    await waitFor(() => {
      expect(getMessagePostCalls()).toHaveLength(1)
    })
    await waitFor(() => {
      expect(screen.queryByLabelText('Не отправлено')).not.toBeInTheDocument()
    })
    await expect(
      offlineOutboxStore.readOutboxRecord({
        clientMessageKey: 'portal-send:retry-failed',
        tenantSlug: 'buhfirma',
        threadId: 'private:me',
        userId: 7,
      }),
    ).resolves.toBeNull()
  })

  it('queues text while offline and keeps the original client message key for later drain', async () => {
    const user = userEvent.setup()

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(createJsonResponse(createThreadsResponse()))
      .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
      .mockResolvedValueOnce(createNotificationSettingsResponse())
      .mockResolvedValueOnce(createSupportAvailabilityResponse())

    renderChatRoute()
    await screen.findByText(
      'Здравствуйте, вижу ваше обращение.',
      {},
      CHAT_PAGE_LOAD_TIMEOUT,
    )
    await waitForInitialChatRequests()
    await waitFor(() => {
      expect(navigator.storage.estimate).toHaveBeenCalled()
    })

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    await user.type(
      screen.getByRole('textbox', { name: 'Сообщение' }),
      'Плохая связь',
    )
    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(
      await screen.findByText(
        'Нет соединения. Сообщения будут отправлены, когда соединение восстановится.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/отправка отключена/i)).not.toBeInTheDocument()
    expect(await screen.findByLabelText('В очереди')).toBeInTheDocument()
    expect(getMessagePostCalls()).toHaveLength(0)
    await waitFor(async () => {
      await expect(
        offlineOutboxStore.listThreadOutboxRecords({
          tenantSlug: 'buhfirma',
          threadId: 'private:me',
          userId: 7,
        }),
      ).resolves.toMatchObject([
        {
          clientMessageKey: expect.stringMatching(/^portal-send:/),
          content: 'Плохая связь',
          status: 'queued',
        },
      ])
    })
  })

  it('keeps a just queued local bubble when earlier outbox hydration resolves later', async () => {
    const user = userEvent.setup()
    const initialHydration = createDeferredValue<OfflineTextOutboxRecord[]>()

    vi.spyOn(
      offlineOutboxStore,
      'listThreadOutboxRecords',
    ).mockReturnValueOnce(initialHydration.promise)

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(createJsonResponse(createThreadsResponse()))
      .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
      .mockResolvedValueOnce(createNotificationSettingsResponse())
      .mockResolvedValueOnce(createSupportAvailabilityResponse())

    renderChatRoute()
    await screen.findByText(
      'Здравствуйте, вижу ваше обращение.',
      {},
      CHAT_PAGE_LOAD_TIMEOUT,
    )
    await waitForInitialChatRequests()
    await waitFor(() => {
      expect(navigator.storage.estimate).toHaveBeenCalled()
    })

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    await user.type(
      screen.getByRole('textbox', { name: 'Сообщение' }),
      'Пока без сети',
    )
    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(await screen.findByText('Пока без сети')).toBeInTheDocument()
    expect(screen.getByLabelText('В очереди')).toBeInTheDocument()

    await act(async () => {
      initialHydration.resolve([])
      await initialHydration.promise
    })

    expect(screen.getByText('Пока без сети')).toBeInTheDocument()
    expect(screen.getByLabelText('В очереди')).toBeInTheDocument()
  })

  it('does not treat user id zero as missing for offline text queueing', async () => {
    const user = userEvent.setup()

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse(0))
      .mockResolvedValueOnce(createJsonResponse(createThreadsResponse()))
      .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
      .mockResolvedValueOnce(createNotificationSettingsResponse())
      .mockResolvedValueOnce(createSupportAvailabilityResponse())

    renderChatRoute()
    await screen.findByText(
      'Здравствуйте, вижу ваше обращение.',
      {},
      CHAT_PAGE_LOAD_TIMEOUT,
    )
    await waitForInitialChatRequests()
    await waitFor(() => {
      expect(navigator.storage.estimate).toHaveBeenCalled()
    })

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    await user.type(
      screen.getByRole('textbox', { name: 'Сообщение' }),
      'Нулевой id',
    )
    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(await screen.findByText('Нулевой id')).toBeInTheDocument()
    expect(screen.getByLabelText('В очереди')).toBeInTheDocument()
    await expect(
      offlineOutboxStore.listThreadOutboxRecords({
        tenantSlug: 'buhfirma',
        threadId: 'private:me',
        userId: 0,
      }),
    ).resolves.toMatchObject([
      {
        content: 'Нулевой id',
        status: 'queued',
      },
    ])
  })

  it('keeps draft visible when offline queueing is disabled by low storage estimate', async () => {
    const user = userEvent.setup()
    setNavigatorStorageEstimate({ quota: 100, usage: 95 })

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(createJsonResponse(createThreadsResponse()))
      .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
      .mockResolvedValueOnce(createNotificationSettingsResponse())
      .mockResolvedValueOnce(createSupportAvailabilityResponse())

    renderChatRoute()
    await screen.findByText(
      'Здравствуйте, вижу ваше обращение.',
      {},
      CHAT_PAGE_LOAD_TIMEOUT,
    )
    await waitForInitialChatRequests()
    await waitFor(() => {
      expect(navigator.storage.estimate).toHaveBeenCalled()
    })

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    await user.type(
      screen.getByRole('textbox', { name: 'Сообщение' }),
      'Мало места',
    )
    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(screen.getByRole('textbox', { name: 'Сообщение' })).toHaveValue(
      'Мало места',
    )
    expect(
      screen.getByText(
        'На устройстве недостаточно места для офлайн-отправки сообщений.',
      ),
    ).toBeInTheDocument()
    expect(getMessagePostCalls()).toHaveLength(0)
  })

  it('renders a queued text message restored from durable outbox after reload', async () => {
    await offlineOutboxStore.saveOutboxRecord(
      createOutboxRecord({
        nextAttemptAt: '2026-05-27T10:10:00.000Z',
      }),
    )

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(createJsonResponse(createThreadsResponse()))
      .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
      .mockResolvedValueOnce(createNotificationSettingsResponse())
      .mockResolvedValueOnce(createSupportAvailabilityResponse())

    renderChatRoute()

    expect(await screen.findByText('Saved queued text')).toBeInTheDocument()
    await waitForInitialChatRequests()
    expect(screen.getByLabelText('В очереди')).toBeInTheDocument()
  })

  it('drains a queued text message on mount and reconciles it to the canonical backend message', async () => {
    await offlineOutboxStore.saveOutboxRecord(
      createOutboxRecord({
        clientMessageKey: 'portal-send:drain-on-mount',
        content: 'Drain me',
      }),
    )

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(createJsonResponse(createThreadsResponse()))
      .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
      .mockResolvedValueOnce(createNotificationSettingsResponse())
      .mockResolvedValueOnce(createSupportAvailabilityResponse())
      .mockResolvedValueOnce(
        createJsonResponse({
          activeThread: privateThread,
          reason: 'none',
          result: 'ready',
          sentMessage: {
            attachments: [],
            authorName: 'Вы',
            authorRole: 'current_user',
            clientMessageKey: 'portal-send:drain-on-mount',
            content: 'Drain me',
            contentType: 'text',
            createdAt: '2026-05-27T10:00:01.000Z',
            direction: 'outgoing',
            id: 601,
            status: 'sent',
          },
        }),
      )

    renderChatRoute()

    await waitForInitialChatRequests()
    await waitFor(() => {
      expect(getMessagePostCalls()).toHaveLength(1)
    })
    await waitFor(() => {
      expect(screen.queryByLabelText('В очереди')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Drain me')).toBeInTheDocument()
    await expect(
      offlineOutboxStore.readOutboxRecord({
        clientMessageKey: 'portal-send:drain-on-mount',
        tenantSlug: 'buhfirma',
        threadId: 'private:me',
        userId: 7,
      }),
    ).resolves.toBeNull()
  })

  it('updates the visible local bubble when drain marks the outbox record failed', async () => {
    await offlineOutboxStore.saveOutboxRecord(
      createOutboxRecord({
        clientMessageKey: 'portal-send:drain-denied',
        content: 'Denied by backend',
      }),
    )

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(createJsonResponse(createThreadsResponse()))
      .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
      .mockResolvedValueOnce(createNotificationSettingsResponse())
      .mockResolvedValueOnce(createSupportAvailabilityResponse())
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            error: {
              code: 'thread_access_denied',
              message: 'Доступ к чату запрещен.',
            },
          },
          403,
        ),
      )

    renderChatRoute()

    expect(await screen.findByText('Denied by backend')).toBeInTheDocument()
    await waitForInitialChatRequests()
    await waitFor(() => {
      expect(getMessagePostCalls()).toHaveLength(1)
    })
    await waitFor(() => {
      expect(screen.getByLabelText('Не отправлено')).toBeInTheDocument()
    })
    await expect(
      offlineOutboxStore.readOutboxRecord({
        clientMessageKey: 'portal-send:drain-denied',
        tenantSlug: 'buhfirma',
        threadId: 'private:me',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      errorCode: 'thread_access_denied',
      status: 'failed',
    })
  })

  it('returns the visible local bubble to queued when drain is rate limited', async () => {
    await offlineOutboxStore.saveOutboxRecord(
      createOutboxRecord({
        clientMessageKey: 'portal-send:rate-limited',
        content: 'Retry later',
      }),
    )

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(createJsonResponse(createThreadsResponse()))
      .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
      .mockResolvedValueOnce(createNotificationSettingsResponse())
      .mockResolvedValueOnce(createSupportAvailabilityResponse())
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            error: {
              code: 'CHAT_SEND_RATE_LIMITED',
              message: 'Слишком много попыток отправки.',
            },
          },
          429,
        ),
      )

    renderChatRoute()

    expect(await screen.findByText('Retry later')).toBeInTheDocument()
    await waitForInitialChatRequests()
    await waitFor(() => {
      expect(getMessagePostCalls()).toHaveLength(1)
    })
    await waitFor(() => {
      expect(screen.getByLabelText('В очереди')).toBeInTheDocument()
    })
    await expect(
      offlineOutboxStore.readOutboxRecord({
        clientMessageKey: 'portal-send:rate-limited',
        tenantSlug: 'buhfirma',
        threadId: 'private:me',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      status: 'queued',
    })
  })

  it('invalidates cached auth after outbox drain receives 401 and keeps unsent text queued', async () => {
    const record = createOutboxRecord({
      clientMessageKey: 'portal-send:auth-rejected',
      content: 'Keep me queued',
    })

    await offlineStore.saveLastActiveIdentity({
      host: window.location.host,
      savedAt: '2026-05-27T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      userId: 7,
    })
    await offlineStore.saveAuthSnapshot({
      lastVerifiedAt: '2026-05-27T10:00:00.000Z',
      offlineAccessUntil: '2026-05-28T10:00:00.000Z',
      savedAt: '2026-05-27T10:00:00.000Z',
      sessionExpiresAt: '2026-06-10T10:00:00.000Z',
      tenantSlug: 'buhfirma',
      user: {
        email: 'name@group.ru',
        fullName: 'Portal User',
        id: 7,
      },
      userId: 7,
    })
    await offlineOutboxStore.saveOutboxRecord(record)

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(createJsonResponse(createThreadsResponse()))
      .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
      .mockResolvedValueOnce(createNotificationSettingsResponse())
      .mockResolvedValueOnce(createSupportAvailabilityResponse())
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            error: {
              code: 'unauthorized',
              message: 'Требуется вход.',
            },
          },
          401,
        ),
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            error: {
              code: 'unauthorized',
              message: 'Требуется вход.',
            },
          },
          401,
        ),
      )

    renderChatRoute()

    await waitForInitialChatRequests()
    await waitFor(async () => {
      await expect(
        offlineStore.readAuthSnapshot('buhfirma', 7),
      ).resolves.toBeNull()
    })
    await expect(
      offlineOutboxStore.readOutboxRecord({
        clientMessageKey: 'portal-send:auth-rejected',
        tenantSlug: 'buhfirma',
        threadId: 'private:me',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      clientMessageKey: 'portal-send:auth-rejected',
      status: 'queued',
    })
  })
})
