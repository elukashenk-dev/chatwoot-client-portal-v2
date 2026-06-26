import { vi } from 'vitest'

import { AppRoutes } from '../../../app/AppRoutes'
import { renderWithRouter } from '../../../test/renderWithRouter'
import {
  AuthSessionContext,
  type AuthSessionContextValue,
} from '../../auth/lib/authSessionContext'
import { TenantIdentityContext } from '../../tenant/lib/tenantIdentityContext'
import { ChatPage } from './ChatPage'
import type { ChatMessagesSnapshot, ChatThreadListSummary } from '../types'

export const CHAT_PAGE_LOAD_TIMEOUT = {
  timeout: 5000,
}

export const tenantContextValue = {
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

export const privateThread = {
  id: 'private:me',
  subtitle: 'Вы и поддержка',
  title: 'Личный чат',
  type: 'private',
} satisfies NonNullable<ChatMessagesSnapshot['activeThread']>

export const cachedGroupThread = {
  id: 'group:254',
  subtitle: 'Групповой чат',
  title: 'Отключенная группа',
  type: 'group',
} satisfies NonNullable<ChatMessagesSnapshot['activeThread']>

export const privateThreadList = {
  ...privateThread,
  unreadCount: 0,
}

export const cachedGroupThreadList = {
  ...cachedGroupThread,
  unreadCount: 0,
}

export const cachedAuthUser = {
  email: 'name@company.ru',
  fullName: 'Portal User',
  id: 7,
  passwordConfigured: true,
}

export function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  })
}

export function createAuthenticatedUserResponse() {
  return createJsonResponse({
    session: {
      expiresAt: '2026-06-10T10:00:00.000Z',
    },
    user: {
      email: 'name@company.ru',
      fullName: 'Portal User',
      id: 7,
      passwordConfigured: true,
    },
  })
}

export function createThreadsResponse() {
  return {
    activeThreadId: privateThread.id,
    threads: [privateThreadList],
    totalUnreadCount: 0,
  }
}

export function createNotificationSettingsResponse() {
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

export function createSupportAvailabilityResponse() {
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

export function createReadySnapshot(
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

export function saveStartupChatFallback({
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

export function renderChatRoute() {
  renderWithRouter(
    <TenantIdentityContext.Provider value={tenantContextValue}>
      <AppRoutes />
    </TenantIdentityContext.Provider>,
    { initialEntries: ['/app/chat'] },
  )
}

export function renderChatPageWithCachedAuth() {
  const authContextValue = {
    completeAuthenticatedSession: vi.fn(async () => undefined),
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

export function createHangingFetch(signal?: AbortSignal | null) {
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

export function createDeferred<TValue>() {
  let resolveValue!: (value: TValue) => void
  const promise = new Promise<TValue>((resolve) => {
    resolveValue = resolve
  })

  return {
    promise,
    resolve: resolveValue,
  }
}
