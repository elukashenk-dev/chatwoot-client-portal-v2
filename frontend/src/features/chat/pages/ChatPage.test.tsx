import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChatMessagesSnapshot } from '../types'
import {
  MockEventSource,
  MockMediaRecorder,
  renderChatRoute,
  setupOfflineChatTestEnvironment,
} from '../../../test/chatPageTestHarness'

const CHAT_PAGE_LOAD_TIMEOUT = {
  timeout: 5000,
}

const privateThread = {
  id: 'private:me',
  subtitle: 'Вы и поддержка',
  title: 'Личный чат',
  type: 'private',
} satisfies NonNullable<ChatMessagesSnapshot['activeThread']>

function createThreadsResponse(overrides: Record<string, unknown> = {}) {
  return {
    activeThreadId: privateThread.id,
    threads: [{ ...privateThread, unreadCount: 0 }],
    totalUnreadCount: 0,
    ...overrides,
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
      {
        attachments: [
          {
            fileSize: 24576,
            fileType: 'pdf',
            id: 9,
            name: 'invoice.pdf',
            thumbUrl: '',
            url: '/api/chat/threads/private%3Ame/attachments/102/9',
          },
        ],
        authorName: 'Вы',
        authorRole: 'current_user',
        content: 'Спасибо, прикладываю файл.',
        contentType: 'text',
        createdAt: '2026-04-21T09:16:00.000Z',
        direction: 'outgoing',
        id: 102,
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

function createSupportAvailabilityResponse(
  currentStatus: 'offline' | 'online' | 'outside_hours' | 'unknown' = 'online',
) {
  return createJsonResponse({
    currentStatus,
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

function createReadSyncResponse() {
  return new Response(null, { status: 204 })
}

function createTypingSyncResponse() {
  return new Response(null, { status: 204 })
}

const originalNavigatorMediaDevices = globalThis.navigator.mediaDevices

function stubMicrophoneAccess() {
  const stopTrack = vi.fn()
  const stream = {
    getTracks: () => [
      {
        stop: stopTrack,
      },
    ],
  } as unknown as MediaStream
  const getUserMedia = vi.fn().mockResolvedValue(stream)

  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia,
    },
  })
  vi.stubGlobal('MediaRecorder', MockMediaRecorder)

  return {
    getUserMedia,
    stopTrack,
  }
}

describe('ChatPage', () => {
  const fetchMock = vi.fn<typeof fetch>()

  function getMessagePostCalls() {
    return fetchMock.mock.calls.filter(
      ([url, options]) =>
        String(url).includes('/api/chat/messages') &&
        options?.method === 'POST',
    )
  }

  function getAttachmentPostCalls() {
    return fetchMock.mock.calls.filter(
      ([url, options]) =>
        String(url) === '/api/chat/messages/attachment' &&
        options?.method === 'POST',
    )
  }

  beforeEach(async () => {
    await setupOfflineChatTestEnvironment()
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      configurable: true,
      value: originalNavigatorMediaDevices,
    })
    fetchMock.mockReset()
    MockEventSource.instances = []
    MockMediaRecorder.instances = []
    MockMediaRecorder.isTypeSupported.mockClear()
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

  it('does not render a legacy startup surface while initial chat runtime is loading', async () => {
    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockReturnValueOnce(new Promise<Response>(() => {}))

    renderChatRoute()

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/chat/threads',
        expect.objectContaining({
          credentials: 'include',
          method: 'GET',
        }),
      )
    })
    expect(
      screen.queryByRole('heading', { name: 'Открываем кабинет' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Готовим чат')).not.toBeInTheDocument()
  })

  it('renders the backend-owned ready transcript without direct chat authority in the browser', async () => {
    mockInitialReadyChatResponses()

    renderChatRoute()

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Личный чат' },
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()
    expect(
      await screen.findByText('Здравствуйте, вижу ваше обращение.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('banner')).toHaveClass('chat-header-background')
    expect(screen.getAllByText('Ольга Support').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Агент:/)).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Открыть навигацию' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Открыть меню чата' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('В работе')).not.toBeInTheDocument()
    expect(screen.queryByText('Календарь сообщений')).not.toBeInTheDocument()
    expect(screen.queryByText(/Показаны последние/)).not.toBeInTheDocument()
    expect(screen.getByText('Спасибо, прикладываю файл.')).toBeInTheDocument()
    expect(screen.getByText('invoice.pdf')).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: 'Сообщение' }),
    ).toBeInTheDocument()

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/chat/messages?threadId=private%3Ame',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      }),
    )
  })

  it('renders real support availability instead of connection readiness', async () => {
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

      if (url === '/api/chat/threads/private%3Ame/read') {
        return createReadSyncResponse()
      }

      if (url === '/api/chat/support-availability') {
        return createSupportAvailabilityResponse('outside_hours')
      }

      if (url === '/api/chat/threads/private%3Ame/notification-settings') {
        return createNotificationSettingsResponse()
      }

      return createJsonResponse({}, 404)
    })

    renderChatRoute()

    expect(
      await screen.findByText(
        'Здравствуйте, вижу ваше обращение.',
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()

    expect(screen.getByText('Вы и поддержка')).toBeInTheDocument()
    expect(
      await screen.findByRole(
        'status',
        { name: 'Вне графика' },
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('status', { name: 'Онлайн' }),
    ).not.toBeInTheDocument()
  })

  it('opens chat info from the chat menu and returns to the transcript', async () => {
    const user = userEvent.setup()

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

      if (url === '/api/chat/threads/private%3Ame/read') {
        return createReadSyncResponse()
      }

      if (url === '/api/chat/support-availability') {
        return createSupportAvailabilityResponse()
      }

      if (url === '/api/chat/threads/private%3Ame/notification-settings') {
        return createNotificationSettingsResponse()
      }

      if (url === '/api/chat/threads/private%3Ame/info') {
        return createJsonResponse({
          accessLabel: 'Вы и поддержка',
          activeThread: privateThread,
          curatorName: 'Анна Маттина',
          lastActivityAt: '2026-05-19T10:20:00.000Z',
          participants: [],
          reason: 'none',
          result: 'ready',
          startedAt: '2026-05-18T09:00:00.000Z',
          supportLabel: 'Команда ProvGroup',
          threadTypeLabel: 'Личный',
        })
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

    await user.click(screen.getByRole('button', { name: 'Открыть меню чата' }))
    await user.click(
      screen.getByRole('menuitem', { name: 'Информация о чате' }),
    )

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Информация о чате' },
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Анна Маттина')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Вернуться к чату' }))

    expect(
      screen.getByText('Здравствуйте, вижу ваше обращение.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Информация о чате' }),
    ).not.toBeInTheDocument()
  })

  it('does not fallback to a group thread after backend rejects person contact authority', async () => {
    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            error: {
              code: 'portal_contact_disabled',
              message:
                'Доступ к порталу настроен некорректно. Обратитесь в поддержку.',
            },
          },
          403,
        ),
      )

    renderChatRoute()

    expect(
      await screen.findByText(
        'Мы не смогли получить состояние переписки из Chatwoot. Попробуйте обновить чат немного позже.',
        {},
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/chat/threads',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      }),
    )
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes('/chat/messages'),
      ),
    ).toBe(false)
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('group%3A')),
    ).toBe(false)
  })

  it('restores focus to the chat menu trigger when Escape closes the menu', async () => {
    const user = userEvent.setup()

    mockInitialReadyChatResponses()

    renderChatRoute()

    const chatMenuButton = await screen.findByRole(
      'button',
      {
        name: 'Открыть меню чата',
      },
      CHAT_PAGE_LOAD_TIMEOUT,
    )

    chatMenuButton.focus()
    await user.keyboard('{Enter}')

    const chatMenu = await screen.findByRole('menu')

    await waitFor(() => {
      expect(chatMenu).toHaveFocus()
    })

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
    expect(chatMenuButton).toHaveFocus()
  })

  it('sends a text reply to a selected message and clears reply state after success', async () => {
    const user = userEvent.setup()

    mockInitialReadyChatResponses()
      .mockResolvedValueOnce(createTypingSyncResponse())
      .mockImplementationOnce(async (_input, options) => {
        const requestBody = JSON.parse(String(options?.body)) as {
          clientMessageKey: string
        }

        return createJsonResponse({
          activeThread: privateThread,
          reason: 'none',
          result: 'ready',
          sentMessage: {
            attachments: [],
            authorName: 'Вы',
            authorRole: 'current_user',
            clientMessageKey: requestBody.clientMessageKey,
            content: 'Отвечаю на вопрос',
            contentType: 'text',
            createdAt: '2026-04-21T09:32:00.000Z',
            direction: 'outgoing',
            id: 503,
            replyTo: {
              attachmentName: null,
              authorName: 'Ольга Support',
              content: 'Здравствуйте, вижу ваше обращение.',
              direction: 'incoming',
              messageId: 101,
            },
            status: 'sent',
          },
        })
      })
    renderChatRoute()

    const sourceMessageText = await screen.findByText(
      'Здравствуйте, вижу ваше обращение.',
      {},
      CHAT_PAGE_LOAD_TIMEOUT,
    )
    const sourceMessageElement = sourceMessageText.closest('[data-message-id]')
    const sourceMessageBubble =
      sourceMessageElement?.querySelector('[data-chat-bubble]')

    if (!(sourceMessageBubble instanceof HTMLElement)) {
      throw new Error('Missing source message bubble.')
    }

    fireEvent.contextMenu(sourceMessageBubble, {
      clientX: 120,
      clientY: 160,
    })
    await user.click(screen.getByRole('menuitem', { name: 'Ответить' }))

    expect(
      screen.getByText('Ответ на сообщение Ольга Support'),
    ).toBeInTheDocument()

    const textarea = screen.getByRole('textbox', { name: 'Сообщение' })

    await user.type(textarea, 'Отвечаю на вопрос')
    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(await screen.findByText('Отвечаю на вопрос')).toBeInTheDocument()
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Отменить ответ' }),
      ).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(getMessagePostCalls()).toHaveLength(1)
    })

    const [, requestOptions] = getMessagePostCalls()[0] ?? []
    const requestBody = JSON.parse(String(requestOptions?.body)) as {
      replyToMessageId: number
    }

    expect(requestBody).toEqual(
      expect.objectContaining({
        content: 'Отвечаю на вопрос',
        threadId: 'private:me',
        replyToMessageId: 101,
      }),
    )
  })

  it('sends one attachment with a text caption through multipart', async () => {
    const user = userEvent.setup()

    mockInitialReadyChatResponses()
      .mockResolvedValueOnce(createTypingSyncResponse())
      .mockResolvedValueOnce(
        createJsonResponse({
          activeThread: privateThread,
          reason: 'none',
          result: 'ready',
          sentMessage: {
            attachments: [
              {
                fileSize: 1024,
                fileType: 'file',
                id: 77,
                name: 'signed-act.pdf',
                thumbUrl: '',
                url: '/api/chat/threads/private%3Ame/attachments/601/77',
              },
            ],
            authorName: 'Вы',
            authorRole: 'current_user',
            content: 'Черновик остается',
            contentType: 'text',
            createdAt: '2026-04-21T09:35:00.000Z',
            direction: 'outgoing',
            id: 601,
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

    const textarea = screen.getByRole('textbox', { name: 'Сообщение' })
    const file = new File(['pdf-content'], 'signed-act.pdf', {
      type: 'application/pdf',
    })

    await user.upload(screen.getByLabelText('Файл вложения'), file)
    await user.type(textarea, 'Черновик остается')
    await user.click(screen.getByRole('button', { name: 'Отправить файл' }))

    expect(await screen.findByText('signed-act.pdf')).toBeInTheDocument()
    expect(screen.getByText('Черновик остается')).toBeInTheDocument()
    expect(textarea).toHaveValue('')
    await waitFor(() => {
      expect(textarea).toHaveFocus()
    })

    const [, requestOptions] = getAttachmentPostCalls()[0] ?? []
    const formData = requestOptions?.body as FormData
    const attachment = formData.get('attachment') as File

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chat/messages/attachment',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
      }),
    )
    expect(requestOptions?.headers).toBeUndefined()
    expect(formData.get('clientMessageKey')).toEqual(
      expect.stringMatching(/^portal-send:/),
    )
    expect(formData.get('content')).toBe('Черновик остается')
    expect(formData.get('threadId')).toBe('private:me')
    expect(attachment.name).toBe('signed-act.pdf')
    expect(attachment.type).toBe('application/pdf')
  })

  it('records and sends a microphone voice message through the attachment pipeline', async () => {
    const user = userEvent.setup()
    const { getUserMedia, stopTrack } = stubMicrophoneAccess()

    mockInitialReadyChatResponses().mockResolvedValueOnce(
      createJsonResponse({
        activeThread: privateThread,
        reason: 'none',
        result: 'ready',
        sentMessage: {
          attachments: [
            {
              fileSize: 11,
              fileType: 'audio',
              id: 78,
              name: 'voice-message.webm',
              thumbUrl: '',
              url: '/api/chat/threads/private%3Ame/attachments/602/78',
            },
          ],
          authorName: 'Вы',
          authorRole: 'current_user',
          content: null,
          contentType: 'text',
          createdAt: '2026-04-21T09:36:00.000Z',
          direction: 'outgoing',
          id: 602,
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

    await user.click(
      screen.getByRole('button', { name: 'Голосовое сообщение' }),
    )

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(await screen.findByText('Запись 00:00')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Отправить голосовое' }),
    )

    expect(await screen.findByText('voice-message.webm')).toBeInTheDocument()
    expect(stopTrack).toHaveBeenCalledTimes(1)

    const [, requestOptions] = getAttachmentPostCalls()[0] ?? []
    const formData = requestOptions?.body as FormData
    const attachment = formData.get('attachment') as File

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chat/messages/attachment',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
      }),
    )
    expect(formData.get('clientMessageKey')).toEqual(
      expect.stringMatching(/^portal-send:/),
    )
    expect(formData.get('threadId')).toBe('private:me')
    expect(attachment.name).toMatch(/^voice-message-\d{8}-\d{6}\.webm$/)
    expect(attachment.type).toContain('audio/webm')
  })

  it('does not let a voice recording error mask the next failed text send state', async () => {
    const user = userEvent.setup()

    fetchMock.mockImplementation(async (input, options) => {
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

      if (
        url === '/api/chat/threads/private%3Ame/read' ||
        url === '/api/chat/threads/private%3Ame/typing'
      ) {
        return createTypingSyncResponse()
      }

      if (url === '/api/chat/threads/private%3Ame/notification-settings') {
        return createNotificationSettingsResponse()
      }

      if (url === '/api/chat/support-availability') {
        return createSupportAvailabilityResponse()
      }

      if (url === '/api/chat/messages' && options?.method === 'POST') {
        return createJsonResponse(
          {
            error: {
              code: 'thread_access_denied',
              message: 'Нет доступа к этому чату.',
            },
          },
          403,
        )
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderChatRoute()

    await screen.findByText(
      'Здравствуйте, вижу ваше обращение.',
      {},
      CHAT_PAGE_LOAD_TIMEOUT,
    )

    await user.click(
      screen.getByRole('button', { name: 'Голосовое сообщение' }),
    )

    expect(
      await screen.findByText('Голосовая запись недоступна в этом браузере.'),
    ).toBeInTheDocument()

    await user.type(
      screen.getByRole('textbox', { name: 'Сообщение' }),
      'Текст после ошибки микрофона',
    )
    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(await screen.findByLabelText('Не отправлено')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Повторить' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Голосовая запись недоступна в этом браузере.'),
    ).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chat/messages',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
      }),
    )
  })

  it('allows the first text send to bootstrap a conversation without a selected conversation id', async () => {
    const user = userEvent.setup()

    mockInitialReadyChatResponses(
      createReadySnapshot({
        messages: [],
        activeThread: privateThread,
        reason: 'conversation_missing',
        result: 'not_ready',
      }),
    )
      .mockResolvedValueOnce(createTypingSyncResponse())
      .mockImplementationOnce(async (_input, options) => {
        const requestBody = JSON.parse(String(options?.body)) as {
          clientMessageKey: string
        }

        return createJsonResponse({
          activeThread: privateThread,
          reason: 'none',
          result: 'ready',
          sentMessage: {
            attachments: [],
            authorName: 'Вы',
            authorRole: 'current_user',
            clientMessageKey: requestBody.clientMessageKey,
            content: 'Первое сообщение',
            contentType: 'text',
            createdAt: '2026-04-21T09:32:00.000Z',
            direction: 'outgoing',
            id: 503,
            status: 'sent',
          },
        })
      })

    renderChatRoute()

    await screen.findByText(
      'Напишите нам, когда будет удобно. Мы ответим здесь.',
      {},
      CHAT_PAGE_LOAD_TIMEOUT,
    )
    await user.type(
      screen.getByRole('textbox', { name: 'Сообщение' }),
      'Первое сообщение',
    )
    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    await waitFor(() => {
      expect(getMessagePostCalls()).toHaveLength(1)
    })
    expect(await screen.findByText('Первое сообщение')).toBeInTheDocument()

    const requestBody = JSON.parse(
      String(getMessagePostCalls()[0]?.[1]?.body),
    ) as {
      threadId?: string
    }

    expect(requestBody.threadId).toBe('private:me')
  })

  it('opens backend realtime and merges new message snapshots into the visible transcript', async () => {
    vi.stubGlobal('EventSource', MockEventSource)

    mockInitialReadyChatResponses(
      createReadySnapshot({
        hasMoreOlder: true,
        messages: [
          {
            attachments: [],
            authorName: 'Вы',
            authorRole: 'current_user',
            content: 'Старое сообщение остается.',
            contentType: 'text',
            createdAt: '2026-04-21T09:12:00.000Z',
            direction: 'outgoing',
            id: 101,
            status: 'sent',
          },
        ],
        nextOlderCursor: 101,
      }),
    )

    renderChatRoute()

    await screen.findByText(
      'Старое сообщение остается.',
      {},
      CHAT_PAGE_LOAD_TIMEOUT,
    )

    await waitFor(() => {
      expect(MockEventSource.instances).toHaveLength(1)
    })
    expect(MockEventSource.instances[0]?.url).toContain(
      '/api/chat/realtime?threadId=private%3Ame',
    )
    expect(MockEventSource.instances[0]?.withCredentials).toBe(true)

    act(() => {
      MockEventSource.instances[0]?.emit(
        'messages',
        createReadySnapshot({
          hasMoreOlder: false,
          messages: [
            {
              attachments: [],
              authorName: 'Ольга Support',
              authorRole: 'agent',
              content: 'Новый ответ без ручного обновления.',
              contentType: 'text',
              createdAt: '2026-04-21T09:17:00.000Z',
              direction: 'incoming',
              id: 102,
              status: 'sent',
            },
          ],
          nextOlderCursor: null,
        }),
      )
    })

    expect(screen.getByText('Старое сообщение остается.')).toBeInTheDocument()
    expect(
      await screen.findByText('Новый ответ без ручного обновления.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Загрузить более ранние сообщения' }),
    ).toBeInTheDocument()
  })
})
