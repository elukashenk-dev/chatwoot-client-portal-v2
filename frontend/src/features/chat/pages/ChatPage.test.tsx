import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '../../../app/AppRoutes'
import { AuthSessionProvider } from '../../auth/lib/AuthSessionProvider'
import { renderWithRouter } from '../../../test/renderWithRouter'
import type { ChatMessagesSnapshot } from '../types'

const CHAT_PAGE_LOAD_TIMEOUT = {
  timeout: 5000,
}

class MockEventSource {
  static instances: MockEventSource[] = []

  readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>()
  readonly close = vi.fn()
  readonly url: string
  readonly withCredentials: boolean | undefined

  constructor(url: string | URL, init?: EventSourceInit) {
    this.url = String(url)
    this.withCredentials = init?.withCredentials
    MockEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const listeners = this.listeners.get(type) ?? new Set()
    const callback =
      typeof listener === 'function'
        ? listener
        : listener.handleEvent.bind(listener)

    listeners.add(callback as (event: MessageEvent) => void)
    this.listeners.set(type, listeners)
  }

  emit(type: string, data: unknown) {
    const event = new MessageEvent(type, {
      data: JSON.stringify(data),
    })

    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }
}

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = []
  static isTypeSupported = vi.fn(
    (mimeType: string) => mimeType === 'audio/webm;codecs=opus',
  )

  mimeType: string
  ondataavailable: ((event: BlobEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onstop: ((event: Event) => void) | null = null
  state: RecordingState = 'inactive'
  stream: MediaStream

  constructor(stream: MediaStream, options?: MediaRecorderOptions) {
    this.stream = stream
    this.mimeType = options?.mimeType ?? 'audio/webm'
    MockMediaRecorder.instances.push(this)
  }

  start() {
    this.state = 'recording'
  }

  stop() {
    if (this.state === 'inactive') {
      return
    }

    this.state = 'inactive'
    this.ondataavailable?.({
      data: new Blob(['voice-bytes'], { type: this.mimeType }),
    } as BlobEvent)
    this.onstop?.(new Event('stop'))
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
      {
        attachments: [
          {
            fileSize: 24576,
            fileType: 'pdf',
            id: 9,
            name: 'invoice.pdf',
            thumbUrl: '',
            url: 'https://example.test/invoice.pdf',
          },
        ],
        authorName: 'Вы',
        content: 'Спасибо, прикладываю файл.',
        contentType: 'text',
        createdAt: '2026-04-21T09:16:00.000Z',
        direction: 'outgoing',
        id: 102,
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

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      configurable: true,
      value: originalNavigatorMediaDevices,
    })
    fetchMock.mockReset()
    MockEventSource.instances = []
    MockMediaRecorder.instances = []
    MockMediaRecorder.isTypeSupported.mockClear()
  })

  it('renders the backend-owned ready transcript without direct chat authority in the browser', async () => {
    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))

    renderChatRoute()

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Клиентский чат' },
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('name@company.ru')).toBeInTheDocument()
    expect(
      await screen.findByText('Здравствуйте, вижу ваше обращение.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Ольга Support')).toBeInTheDocument()
    expect(screen.getByText('В работе')).toBeInTheDocument()
    expect(screen.getByText('Спасибо, прикладываю файл.')).toBeInTheDocument()
    expect(screen.getByText('invoice.pdf')).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: 'Сообщение' }),
    ).toBeInTheDocument()

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/chat/messages',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      }),
    )
  })

  it('inserts a quick emoji phrase into the composer draft at the cursor position', async () => {
    const user = userEvent.setup()

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))

    renderChatRoute()

    await screen.findByText(
      'Здравствуйте, вижу ваше обращение.',
      {},
      CHAT_PAGE_LOAD_TIMEOUT,
    )

    const textarea = screen.getByRole('textbox', {
      name: 'Сообщение',
    }) as HTMLTextAreaElement

    await user.type(textarea, 'Привет конец')

    act(() => {
      textarea.setSelectionRange(7, 7)
    })

    await user.click(screen.getByRole('button', { name: 'Добавить ✅ Готово' }))

    expect(textarea).toHaveValue('Привет ✅ Готовоконец')
    await waitFor(() => {
      expect(textarea).toHaveFocus()
    })
    expect(textarea.selectionStart).toBe('Привет ✅ Готово'.length)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('loads older messages through the bounded history cursor', async () => {
    const user = userEvent.setup()

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(
        createJsonResponse(
          createReadySnapshot({
            hasMoreOlder: true,
            messages: [
              {
                attachments: [],
                authorName: 'Ольга Support',
                content: 'Последнее сообщение.',
                contentType: 'text',
                createdAt: '2026-04-21T10:00:00.000Z',
                direction: 'incoming',
                id: 205,
                status: 'sent',
              },
            ],
            nextOlderCursor: 205,
          }),
        ),
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          createReadySnapshot({
            hasMoreOlder: false,
            messages: [
              {
                attachments: [],
                authorName: 'Вы',
                content: 'Ранее отправленное сообщение.',
                contentType: 'text',
                createdAt: '2026-04-20T08:00:00.000Z',
                direction: 'outgoing',
                id: 120,
                status: 'sent',
              },
            ],
            nextOlderCursor: null,
          }),
        ),
      )

    renderChatRoute()

    await user.click(
      await screen.findByRole(
        'button',
        {
          name: 'Загрузить более ранние сообщения',
        },
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    )

    expect(
      await screen.findByText('Ранее отправленное сообщение.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Последнее сообщение.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/chat/messages?primaryConversationId=77&beforeMessageId=205',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      }),
    )
  })

  it('keeps the visible transcript when older history loading fails', async () => {
    const user = userEvent.setup()

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(
        createJsonResponse(
          createReadySnapshot({
            hasMoreOlder: true,
            messages: [
              {
                attachments: [],
                authorName: 'Ольга Support',
                content: 'Текущее сообщение остается на экране.',
                contentType: 'text',
                createdAt: '2026-04-21T10:00:00.000Z',
                direction: 'incoming',
                id: 205,
                status: 'sent',
              },
            ],
            nextOlderCursor: 205,
          }),
        ),
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            error: {
              code: 'invalid_history_cursor',
              message: 'History cursor is invalid.',
            },
          },
          400,
        ),
      )

    renderChatRoute()

    await user.click(
      await screen.findByRole(
        'button',
        {
          name: 'Загрузить более ранние сообщения',
        },
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    )

    expect(
      await screen.findByText('Текущее сообщение остается на экране.'),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(
        'Не удалось загрузить более ранние сообщения. Попробуйте еще раз.',
      ),
    ).toBeInTheDocument()
  })

  it('does not merge a non-ready older history response into the ready transcript', async () => {
    const user = userEvent.setup()

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(
        createJsonResponse(
          createReadySnapshot({
            hasMoreOlder: true,
            messages: [
              {
                attachments: [],
                authorName: 'Ольга Support',
                content: 'Готовая история остается видимой.',
                contentType: 'text',
                createdAt: '2026-04-21T10:00:00.000Z',
                direction: 'incoming',
                id: 205,
                status: 'sent',
              },
            ],
            nextOlderCursor: 205,
          }),
        ),
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          createReadySnapshot({
            hasMoreOlder: false,
            messages: [],
            nextOlderCursor: null,
            primaryConversation: null,
            reason: 'primary_conversation_missing',
            result: 'not_ready',
          }),
        ),
      )

    renderChatRoute()

    await user.click(
      await screen.findByRole(
        'button',
        {
          name: 'Загрузить более ранние сообщения',
        },
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    )

    expect(
      await screen.findByText('Готовая история остается видимой.'),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(
        'Не удалось загрузить более ранние сообщения. Попробуйте еще раз.',
      ),
    ).toBeInTheDocument()
  })

  it('sends a text reply to a selected message and clears reply state after success', async () => {
    const user = userEvent.setup()

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
      .mockResolvedValueOnce(
        createJsonResponse({
          linkedContact: {
            id: 42,
          },
          primaryConversation: {
            assigneeName: 'Ольга Support',
            id: 77,
            inboxId: 9,
            lastActivityAt: 1776763700,
            status: 'open',
          },
          reason: 'none',
          result: 'ready',
          sentMessage: {
            attachments: [],
            authorName: 'Вы',
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
        }),
      )

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

    const [, requestOptions] = fetchMock.mock.calls[2] ?? []
    const requestBody = JSON.parse(String(requestOptions?.body)) as {
      replyToMessageId: number
    }

    expect(requestBody).toEqual(
      expect.objectContaining({
        content: 'Отвечаю на вопрос',
        primaryConversationId: 77,
        replyToMessageId: 101,
      }),
    )
  })

  it('sends one attachment through multipart without clearing draft text', async () => {
    const user = userEvent.setup()

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
      .mockResolvedValueOnce(
        createJsonResponse({
          linkedContact: {
            id: 42,
          },
          primaryConversation: {
            assigneeName: 'Ольга Support',
            id: 77,
            inboxId: 9,
            lastActivityAt: 1776763650,
            status: 'open',
          },
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
                url: 'https://files.example.test/signed-act.pdf',
              },
            ],
            authorName: 'Вы',
            content: null,
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

    await user.type(textarea, 'Черновик остается')
    await user.upload(screen.getByLabelText('Файл вложения'), file)
    await user.click(screen.getByRole('button', { name: 'Отправить файл' }))

    expect(await screen.findByText('signed-act.pdf')).toBeInTheDocument()
    expect(textarea).toHaveValue('Черновик остается')
    await waitFor(() => {
      expect(textarea).toHaveFocus()
    })

    const [, requestOptions] = fetchMock.mock.calls[2] ?? []
    const formData = requestOptions?.body as FormData
    const attachment = formData.get('attachment') as File

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
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
    expect(formData.get('primaryConversationId')).toBe('77')
    expect(attachment.name).toBe('signed-act.pdf')
    expect(attachment.type).toBe('application/pdf')
  })

  it('records and sends a microphone voice message through the attachment pipeline', async () => {
    const user = userEvent.setup()
    const { getUserMedia, stopTrack } = stubMicrophoneAccess()

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(createJsonResponse(createReadySnapshot()))
      .mockResolvedValueOnce(
        createJsonResponse({
          linkedContact: {
            id: 42,
          },
          primaryConversation: {
            assigneeName: 'Ольга Support',
            id: 77,
            inboxId: 9,
            lastActivityAt: 1776763650,
            status: 'open',
          },
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
                url: 'https://files.example.test/voice-message.webm',
              },
            ],
            authorName: 'Вы',
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

    const [, requestOptions] = fetchMock.mock.calls[2] ?? []
    const formData = requestOptions?.body as FormData
    const attachment = formData.get('attachment') as File

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/chat/messages/attachment',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
      }),
    )
    expect(formData.get('clientMessageKey')).toEqual(
      expect.stringMatching(/^portal-send:/),
    )
    expect(formData.get('primaryConversationId')).toBe('77')
    expect(attachment.name).toMatch(/^voice-message-\d{8}-\d{6}\.webm$/)
    expect(attachment.type).toContain('audio/webm')
  })

  it('does not let a voice recording error mask the next failed text send state', async () => {
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

    expect(await screen.findByText('Не отправлено')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Повторить' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Голосовая запись недоступна в этом браузере.'),
    ).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('allows the first text send to bootstrap a conversation without a selected conversation id', async () => {
    const user = userEvent.setup()

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(
        createJsonResponse(
          createReadySnapshot({
            linkedContact: {
              id: 42,
            },
            messages: [],
            primaryConversation: null,
            reason: 'conversation_missing',
            result: 'not_ready',
          }),
        ),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          linkedContact: {
            id: 42,
          },
          primaryConversation: {
            assigneeName: null,
            id: 301,
            inboxId: 9,
            lastActivityAt: 1776763600,
            status: 'open',
          },
          reason: 'none',
          result: 'ready',
          sentMessage: {
            attachments: [],
            authorName: 'Вы',
            content: 'Первое сообщение',
            contentType: 'text',
            createdAt: '2026-04-21T09:32:00.000Z',
            direction: 'outgoing',
            id: 503,
            status: 'sent',
          },
        }),
      )

    renderChatRoute()

    await screen.findByText(
      'В этой переписке пока нет сообщений, доступных клиентскому порталу.',
      {},
      CHAT_PAGE_LOAD_TIMEOUT,
    )
    await user.type(
      screen.getByRole('textbox', { name: 'Сообщение' }),
      'Первое сообщение',
    )
    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(await screen.findByText('Первое сообщение')).toBeInTheDocument()

    const requestBody = JSON.parse(
      String(fetchMock.mock.calls[2]?.[1]?.body),
    ) as {
      primaryConversationId?: number
    }

    expect(requestBody.primaryConversationId).toBeUndefined()
  })

  it('opens backend realtime and merges new message snapshots into the visible transcript', async () => {
    vi.stubGlobal('EventSource', MockEventSource)

    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(
        createJsonResponse(
          createReadySnapshot({
            hasMoreOlder: true,
            messages: [
              {
                attachments: [],
                authorName: 'Вы',
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
        ),
      )

    renderChatRoute()

    await screen.findByText(
      'Старое сообщение остается.',
      {},
      CHAT_PAGE_LOAD_TIMEOUT,
    )

    expect(MockEventSource.instances).toHaveLength(1)
    expect(MockEventSource.instances[0]?.url).toContain(
      '/api/chat/realtime?primaryConversationId=77',
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
