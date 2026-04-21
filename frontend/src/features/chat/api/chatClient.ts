import type { ChatMessagesSnapshot, ChatSendResult } from '../types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'
const NETWORK_ERROR_MESSAGE =
  'Мы не смогли загрузить чат. Проверьте подключение и попробуйте еще раз.'

type ApiErrorResponse = {
  error?: {
    code?: string
    message?: string
  }
}

export class ChatApiClientError extends Error {
  readonly code?: string
  readonly statusCode: number

  constructor({
    code,
    message,
    statusCode,
  }: {
    code?: string
    message: string
    statusCode: number
  }) {
    super(message)

    this.name = 'ChatApiClientError'
    this.code = code
    this.statusCode = statusCode
  }
}

async function parseJsonBody(response: Response) {
  const contentType = response.headers.get('content-type')

  if (!contentType?.includes('application/json')) {
    return null
  }

  try {
    return (await response.json()) as unknown
  } catch {
    return null
  }
}

async function request<TResponse>(
  path: string,
  {
    body,
    method = 'GET',
    networkErrorMessage = NETWORK_ERROR_MESSAGE,
  }: {
    body?: unknown
    method?: 'GET' | 'POST'
    networkErrorMessage?: string
  } = {},
): Promise<TResponse> {
  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      headers:
        body === undefined
          ? undefined
          : {
              'Content-Type': 'application/json',
            },
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch {
    throw new ChatApiClientError({
      message: networkErrorMessage,
      statusCode: 0,
    })
  }

  const payload = await parseJsonBody(response)

  if (!response.ok) {
    const errorPayload = payload as ApiErrorResponse | null

    throw new ChatApiClientError({
      code: errorPayload?.error?.code,
      message: errorPayload?.error?.message ?? networkErrorMessage,
      statusCode: response.status,
    })
  }

  return payload as TResponse
}

export async function getChatMessages({
  beforeMessageId,
  primaryConversationId,
}: {
  beforeMessageId?: number | null
  primaryConversationId?: number | null
} = {}) {
  const searchParams = new URLSearchParams()

  if (primaryConversationId) {
    searchParams.set('primaryConversationId', String(primaryConversationId))
  }

  if (beforeMessageId) {
    searchParams.set('beforeMessageId', String(beforeMessageId))
  }

  const query = searchParams.toString()

  return request<ChatMessagesSnapshot>(
    `/chat/messages${query ? `?${query}` : ''}`,
  )
}

export async function sendChatMessage({
  clientMessageKey,
  content,
  primaryConversationId,
}: {
  clientMessageKey: string
  content: string
  primaryConversationId?: number | null
}) {
  return request<ChatSendResult>('/chat/messages', {
    body: {
      clientMessageKey,
      content,
      ...(primaryConversationId
        ? {
            primaryConversationId,
          }
        : {}),
    },
    method: 'POST',
    networkErrorMessage: 'Не удалось отправить сообщение. Попробуйте еще раз.',
  })
}
