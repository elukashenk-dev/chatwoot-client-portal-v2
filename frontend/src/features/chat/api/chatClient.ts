import type {
  ChatMessagesSnapshot,
  ChatMessageContextDirection,
  ChatMessageContextResponse,
  ChatNotificationOverrides,
  ChatNotificationSettings,
  ChatSendResult,
  ChatSupportAvailabilityResponse,
  ChatThreadInfoResponse,
  ChatThreadMediaResponse,
  ChatThreadSearchResponse,
  ChatThreadsResponse,
  PushPublicKeyResponse,
  UserNotificationSettings,
} from '../types'

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
    formData,
    method = 'GET',
    networkErrorMessage = NETWORK_ERROR_MESSAGE,
  }: {
    body?: unknown
    formData?: FormData
    method?: 'DELETE' | 'GET' | 'PATCH' | 'POST'
    networkErrorMessage?: string
  } = {},
): Promise<TResponse> {
  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      headers:
        body === undefined || formData !== undefined
          ? undefined
          : {
              'Content-Type': 'application/json',
            },
      method,
      ...(formData !== undefined
        ? { body: formData }
        : body === undefined
          ? {}
          : { body: JSON.stringify(body) }),
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
  threadId,
}: {
  beforeMessageId?: number | null
  threadId: string
}) {
  const searchParams = new URLSearchParams()

  searchParams.set('threadId', threadId)

  if (beforeMessageId) {
    searchParams.set('beforeMessageId', String(beforeMessageId))
  }

  const query = searchParams.toString()

  return request<ChatMessagesSnapshot>(
    `/chat/messages${query ? `?${query}` : ''}`,
  )
}

export async function getChatThreads() {
  return request<ChatThreadsResponse>('/chat/threads')
}

export async function getChatSupportAvailability() {
  return request<ChatSupportAvailabilityResponse>('/chat/support-availability')
}

export async function getUserNotificationSettings() {
  return request<UserNotificationSettings>('/notifications/settings')
}

export async function updateUserNotificationSettings(
  patch: Partial<UserNotificationSettings>,
) {
  return request<UserNotificationSettings>('/notifications/settings', {
    body: patch,
    method: 'PATCH',
    networkErrorMessage:
      'Не удалось обновить настройки уведомлений. Попробуйте еще раз.',
  })
}

export async function getChatThreadInfo(threadId: string) {
  return request<ChatThreadInfoResponse>(
    `/chat/threads/${encodeURIComponent(threadId)}/info`,
  )
}

export async function getChatNotificationSettings(threadId: string) {
  return request<ChatNotificationSettings>(
    `/chat/threads/${encodeURIComponent(threadId)}/notification-settings`,
  )
}

export async function updateChatNotificationSettings(
  threadId: string,
  patch: Partial<ChatNotificationOverrides>,
) {
  return request<ChatNotificationSettings>(
    `/chat/threads/${encodeURIComponent(threadId)}/notification-settings`,
    {
      body: patch,
      method: 'PATCH',
      networkErrorMessage:
        'Не удалось обновить настройки уведомлений. Попробуйте еще раз.',
    },
  )
}

export async function getPushPublicKey() {
  return request<PushPublicKeyResponse>('/notifications/push/public-key')
}

export async function savePushSubscription(subscription: PushSubscriptionJSON) {
  await request<void>('/notifications/push/subscriptions', {
    body: {
      endpoint: subscription.endpoint,
      keys: {
        auth: subscription.keys?.auth,
        p256dh: subscription.keys?.p256dh,
      },
    },
    method: 'POST',
    networkErrorMessage:
      'Не удалось включить push-уведомления. Попробуйте еще раз.',
  })
}

export async function deletePushSubscription(endpoint: string) {
  await request<void>('/notifications/push/subscriptions', {
    body: { endpoint },
    method: 'DELETE',
    networkErrorMessage:
      'Не удалось отключить push на этом устройстве. Попробуйте еще раз.',
  })
}

export async function getChatThreadMedia({
  beforeMessageId,
  threadId,
}: {
  beforeMessageId?: number | null
  threadId: string
}) {
  const searchParams = new URLSearchParams()

  if (beforeMessageId) {
    searchParams.set('beforeMessageId', String(beforeMessageId))
  }

  const query = searchParams.toString()

  return request<ChatThreadMediaResponse>(
    `/chat/threads/${encodeURIComponent(threadId)}/media${
      query ? `?${query}` : ''
    }`,
  )
}

export async function getChatThreadSearch({
  beforeMessageId,
  query,
  threadId,
}: {
  beforeMessageId?: number | null
  query: string
  threadId: string
}) {
  const searchParams = new URLSearchParams()

  searchParams.set('q', query)

  if (beforeMessageId) {
    searchParams.set('beforeMessageId', String(beforeMessageId))
  }

  const queryString = searchParams.toString()

  return request<ChatThreadSearchResponse>(
    `/chat/threads/${encodeURIComponent(threadId)}/search${
      queryString ? `?${queryString}` : ''
    }`,
  )
}

export async function getChatThreadMessageContext({
  cursorMessageId,
  direction = 'initial',
  messageId,
  threadId,
}: {
  cursorMessageId?: number | null
  direction?: ChatMessageContextDirection
  messageId: number
  threadId: string
}) {
  const searchParams = new URLSearchParams()

  searchParams.set('messageId', String(messageId))

  if (direction !== 'initial') {
    searchParams.set('direction', direction)
  }

  if (cursorMessageId) {
    searchParams.set('cursor', String(cursorMessageId))
  }

  const query = searchParams.toString()

  return request<ChatMessageContextResponse>(
    `/chat/threads/${encodeURIComponent(threadId)}/messages/context${
      query ? `?${query}` : ''
    }`,
  )
}

export async function sendChatMessage({
  clientMessageKey,
  content,
  replyToMessageId,
  threadId,
}: {
  clientMessageKey: string
  content: string
  replyToMessageId?: number | null
  threadId: string
}) {
  return request<ChatSendResult>('/chat/messages', {
    body: {
      clientMessageKey,
      content,
      ...(replyToMessageId
        ? {
            replyToMessageId,
          }
        : {}),
      threadId,
    },
    method: 'POST',
    networkErrorMessage: 'Не удалось отправить сообщение. Попробуйте еще раз.',
  })
}

export async function sendChatAttachment({
  clientMessageKey,
  content,
  file,
  replyToMessageId,
  threadId,
}: {
  clientMessageKey: string
  content?: string | null
  file: File
  replyToMessageId?: number | null
  threadId: string
}) {
  const formData = new FormData()
  const normalizedContent = content?.trim()

  formData.append('clientMessageKey', clientMessageKey)

  if (normalizedContent) {
    formData.append('content', normalizedContent)
  }

  formData.append('threadId', threadId)

  if (replyToMessageId) {
    formData.append('replyToMessageId', String(replyToMessageId))
  }

  formData.append('attachment', file, file.name)

  return request<ChatSendResult>('/chat/messages/attachment', {
    formData,
    method: 'POST',
    networkErrorMessage: 'Не удалось отправить файл. Попробуйте еще раз.',
  })
}
