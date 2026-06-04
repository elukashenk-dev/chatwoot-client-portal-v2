import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChatMessagesSnapshot } from '../types'
import {
  renderChatRoute,
  setupOfflineChatTestEnvironment,
} from '../../../test/chatPageTestHarness'

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
    threads: [{ ...privateThread, unreadCount: 0 }],
    totalUnreadCount: 0,
  }
}

function createReadSyncSnapshot(): ChatMessagesSnapshot {
  return {
    activeThread: privateThread,
    hasMoreOlder: false,
    messages: [
      {
        attachments: [],
        authorName: 'Ольга Support',
        authorRole: 'agent',
        content: 'Пожалуйста, проверьте последние документы.',
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

describe('ChatPage read sync', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(async () => {
    await setupOfflineChatTestEnvironment()
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('posts mark-read after the latest agent message is rendered at the transcript edge', async () => {
    const snapshot = createReadSyncSnapshot()

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return createAuthenticatedUserResponse()
      }

      if (url === '/api/chat/threads') {
        return createJsonResponse(createThreadsResponse())
      }

      if (url === '/api/chat/messages?threadId=private%3Ame') {
        return createJsonResponse(snapshot)
      }

      if (url === '/api/chat/threads/private%3Ame/read') {
        return new Response(null, { status: 204 })
      }

      if (url === '/api/chat/threads/private%3Ame/notification-settings') {
        return createNotificationSettingsResponse()
      }

      if (url === '/api/chat/support-availability') {
        return createSupportAvailabilityResponse()
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatRoute()

    expect(
      await screen.findByText('Пожалуйста, проверьте последние документы.'),
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(
          ([url, options]) =>
            String(url) === '/api/chat/threads/private%3Ame/read' &&
            options?.method === 'POST',
        ),
      ).toHaveLength(1)
    })
  })
})
