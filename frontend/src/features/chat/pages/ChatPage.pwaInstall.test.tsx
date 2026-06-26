import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '../../../app/AppRoutes'
import { pwaInstallPromptInternalsForTests } from '../../../pwa/installPromptContext'
import {
  PwaInstallPromptCapture,
  PwaInstallPromptProvider,
} from '../../../pwa/installPromptRuntime'
import {
  renderChatRoute,
  setupOfflineChatTestEnvironment,
} from '../../../test/chatPageTestHarness'
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

type MockBeforeInstallPromptEvent = Event & {
  prompt: ReturnType<typeof vi.fn<() => Promise<void>>>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function createBeforeInstallPromptEvent(): MockBeforeInstallPromptEvent {
  const event = new Event('beforeinstallprompt', {
    cancelable: true,
  }) as MockBeforeInstallPromptEvent

  event.prompt = vi.fn().mockResolvedValue(undefined)
  event.userChoice = Promise.resolve({
    outcome: 'accepted',
    platform: 'web',
  })

  return event
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
      email: 'name@group.ru',
      fullName: 'Portal User',
      id: 7,
    },
  })
}

function createThreadsResponse() {
  return {
    activeThreadId: privateThread.id,
    threads: [{ ...privateThread, unreadCount: 0 }],
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

function renderChatRouteWithPwaInstallRuntime() {
  renderChatRoute(
    <>
      <PwaInstallPromptCapture />
      <PwaInstallPromptProvider>
        <AppRoutes />
      </PwaInstallPromptProvider>
    </>,
  )
}

describe('ChatPage PWA install prompt', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(async () => {
    pwaInstallPromptInternalsForTests.resetPromptEventSnapshot()
    await setupOfflineChatTestEnvironment()
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    fetchMock.mockReset()
  })

  function mockInitialReadyChatResponses(
    snapshot: ChatMessagesSnapshot = createReadySnapshot(),
  ) {
    return fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(createJsonResponse(createThreadsResponse()))
      .mockResolvedValueOnce(createJsonResponse(snapshot))
      .mockResolvedValueOnce(createNotificationSettingsResponse())
      .mockResolvedValueOnce(createSupportAvailabilityResponse())
  }

  it('shows the PWA install banner only after chat runtime is ready and install is available', async () => {
    mockInitialReadyChatResponses()

    renderChatRouteWithPwaInstallRuntime()

    expect(screen.queryByText('Установите кабинет')).not.toBeInTheDocument()
    expect(
      await screen.findByText(
        'Здравствуйте, вижу ваше обращение.',
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()

    await act(async () => {
      window.dispatchEvent(createBeforeInstallPromptEvent())
    })

    expect(screen.getByText('Установите кабинет')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Установить' })).toBeInTheDocument()
  })

  it('does not show the PWA install menu action before the transcript surface is available', async () => {
    const user = userEvent.setup()
    const installEvent = createBeforeInstallPromptEvent()

    mockInitialReadyChatResponses(
      createReadySnapshot({
        activeThread: null,
        messages: [],
        reason: 'chatwoot_not_configured',
        result: 'not_ready',
      }),
    )

    renderChatRouteWithPwaInstallRuntime()

    await act(async () => {
      window.dispatchEvent(installEvent)
    })

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Чат временно недоступен' },
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Открыть меню чата' }))

    expect(screen.queryByText('Установите кабинет')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('menuitem', { name: 'Установить приложение' }),
    ).not.toBeInTheDocument()
    expect(installEvent.prompt).not.toHaveBeenCalled()
  })
})
