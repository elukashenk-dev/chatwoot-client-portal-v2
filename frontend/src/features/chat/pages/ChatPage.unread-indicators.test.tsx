import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '../../../app/AppRoutes'
import { renderWithRouter } from '../../../test/renderWithRouter'
import type { PortalPushMessagePayload } from '../../../pwa/serviceWorkerRuntime'
import { AuthSessionProvider } from '../../auth/lib/AuthSessionProvider'
import type {
  ChatMessage,
  ChatMessagesSnapshot,
  ChatNotificationSettings,
} from '../types'

type RegisterPortalPushMessageListener = (
  handler: (payload: PortalPushMessagePayload) => boolean | Promise<boolean>,
  options?: { activeThreadId?: string | null },
) => () => void

const serviceWorkerRuntimeMock = vi.hoisted(() => ({
  registerPortalPushMessageListener: vi.fn<RegisterPortalPushMessageListener>(
    () => vi.fn(),
  ),
}))

vi.mock('../../../pwa/serviceWorkerRuntime', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../pwa/serviceWorkerRuntime')>()

  return {
    ...actual,
    registerPortalPushMessageListener:
      serviceWorkerRuntimeMock.registerPortalPushMessageListener,
  }
})

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
    threads: [privateThread, groupThread],
  }
}

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    attachments: [],
    authorName: 'Ольга Support',
    authorRole: 'agent',
    content: 'Здравствуйте, вижу ваше обращение.',
    contentType: 'text',
    createdAt: '2026-04-21T09:12:00.000Z',
    direction: 'incoming',
    id: 101,
    status: 'sent',
    ...overrides,
  }
}

function createReadySnapshot(
  overrides: Partial<ChatMessagesSnapshot> = {},
): ChatMessagesSnapshot {
  return {
    activeThread: privateThread,
    hasMoreOlder: false,
    messages: [createMessage()],
    nextOlderCursor: null,
    reason: 'none',
    result: 'ready',
    ...overrides,
  }
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

function createNotificationSettings(
  threadId: string,
): ChatNotificationSettings {
  return {
    effective: {
      newMessagesEnabled: true,
      pushEnabled: true,
      soundEnabled: true,
    },
    global: {
      newMessagesEnabled: true,
      pushEnabled: true,
      soundEnabled: true,
    },
    overrides: {
      newMessagesEnabled: null,
      pushEnabled: null,
      soundEnabled: null,
    },
    threadId,
  }
}

function createOtherThreadPush(): PortalPushMessagePayload {
  return {
    chatwootMessageId: 9001,
    tenantSlug: 'buhfirma',
    threadId: 'group:154',
    threadTitle: 'ООО "Ромашка"',
    threadType: 'group',
    type: 'chat_message',
    url: '/',
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

async function getLatestPushHandler() {
  await waitFor(() => {
    expect(
      serviceWorkerRuntimeMock.registerPortalPushMessageListener,
    ).toHaveBeenCalled()
  })

  return serviceWorkerRuntimeMock.registerPortalPushMessageListener.mock.calls.at(
    -1,
  )?.[0]
}

describe('ChatPage unread indicators', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    serviceWorkerRuntimeMock.registerPortalPushMessageListener.mockClear()
    vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fetchMock.mockReset()
  })

  it('shows and clears a local unread dot for another chat push', async () => {
    const groupSnapshot = createReadySnapshot({
      activeThread: groupThread,
      messages: [
        createMessage({
          authorName: 'Иван Петров',
          authorRole: 'group_member',
          content: 'Сообщение из общего чата',
          direction: 'incoming',
          id: 714,
        }),
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

      if (url === '/api/chat/support-availability') {
        return createSupportAvailabilityResponse()
      }

      if (url === '/api/chat/threads/private%3Ame/notification-settings') {
        return createJsonResponse(createNotificationSettings('private:me'))
      }

      if (url === '/api/chat/messages?threadId=group%3A154') {
        return createJsonResponse(groupSnapshot)
      }

      if (url === '/api/chat/threads/group%3A154/notification-settings') {
        return createJsonResponse(createNotificationSettings('group:154'))
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    const user = userEvent.setup()

    renderChatRoute()

    await screen.findByText(
      'Здравствуйте, вижу ваше обращение.',
      {},
      CHAT_PAGE_LOAD_TIMEOUT,
    )

    const handler = await getLatestPushHandler()

    expect(handler?.(createOtherThreadPush())).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Открыть навигацию' }))

    expect(
      screen.getByRole('menuitem', {
        name: /ООО "Ромашка".*есть новое сообщение/i,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('thread-unread-dot-group:154'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('menuitem', { name: /ООО "Ромашка"/i }))

    expect(
      await screen.findByRole(
        'heading',
        { name: 'ООО "Ромашка"' },
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Открыть навигацию' }))
    expect(
      screen.queryByTestId('thread-unread-dot-group:154'),
    ).not.toBeInTheDocument()
  })

  it('keeps the unread dot when the marked chat fails to open', async () => {
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
        return createJsonResponse(createNotificationSettings('private:me'))
      }

      if (url === '/api/chat/messages?threadId=group%3A154') {
        return createJsonResponse(
          {
            error: {
              code: 'chatwoot_unavailable',
              message: 'Chatwoot unavailable.',
            },
          },
          503,
        )
      }

      if (url === '/api/chat/threads/group%3A154/notification-settings') {
        return createJsonResponse(createNotificationSettings('group:154'))
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    const user = userEvent.setup()

    renderChatRoute()

    await screen.findByText(
      'Здравствуйте, вижу ваше обращение.',
      {},
      CHAT_PAGE_LOAD_TIMEOUT,
    )

    const handler = await getLatestPushHandler()

    expect(handler?.(createOtherThreadPush())).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Открыть навигацию' }))
    expect(
      screen.getByTestId('thread-unread-dot-group:154'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('menuitem', { name: /ООО "Ромашка"/i }))

    expect(
      await screen.findByText(
        'Чат временно недоступен',
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Открыть навигацию' }))
    expect(
      screen.getByTestId('thread-unread-dot-group:154'),
    ).toBeInTheDocument()
  })
})
