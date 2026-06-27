import { AdminApiClientError } from '../../admin-auth/api/adminAuthClient'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'
const NETWORK_ERROR_MESSAGE =
  'Мы не смогли выполнить запрос. Попробуйте еще раз чуть позже.'

const bridgeSetupErrorMessages = new Map<number, string>([
  [400, 'Проверьте ссылку на источник и токен Telegram бота.'],
  [401, 'Войдите в админ-консоль заново.'],
  [403, 'Запрос отклонен для этого портала.'],
  [409, 'Этот Telegram бот или источник уже подключен.'],
  [502, 'Не удалось связаться с Telegram или системой поддержки.'],
])

type ApiErrorResponse = {
  error?: {
    code?: string
  }
}

export type TelegramBridgeAdminStatus = {
  chatwootTelegramInboxId: number
  displayName: string
  lastWebhookCheckedAt: string | null
  lastWebhookHost: string | null
  lastWebhookOwner: string | null
  publicKey: string
  status: string
  telegramBotId: string
  telegramBotUsername: string
  webhookConfigured: boolean
}

export type TelegramBridgeAdminSetupResponse = {
  bridge: TelegramBridgeAdminStatus
}

export type TelegramBridgeSetupRequest = {
  chatwootInboxUrl: string
  telegramBotToken: string
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

function getSafeSetupErrorMessage(statusCode: number) {
  return bridgeSetupErrorMessages.get(statusCode) ?? NETWORK_ERROR_MESSAGE
}

async function request<TResponse>(path: string, init: RequestInit) {
  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      ...init,
    })
  } catch {
    throw new AdminApiClientError({
      message: NETWORK_ERROR_MESSAGE,
      statusCode: 0,
    })
  }

  const payload = await parseJsonBody(response)

  if (!response.ok) {
    const errorPayload = payload as ApiErrorResponse | null

    throw new AdminApiClientError({
      code: errorPayload?.error?.code,
      message: getSafeSetupErrorMessage(response.status),
      statusCode: response.status,
    })
  }

  return payload as TResponse
}

export function setupTelegramBridge(input: TelegramBridgeSetupRequest) {
  return request<TelegramBridgeAdminSetupResponse>(
    '/admin/integrations/telegram-bridge/setup',
    {
      body: JSON.stringify({
        chatwootInboxUrl: input.chatwootInboxUrl,
        telegramBotToken: input.telegramBotToken,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
  )
}
