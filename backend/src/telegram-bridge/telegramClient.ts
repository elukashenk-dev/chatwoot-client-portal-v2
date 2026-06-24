import { redactTelegramBridgeSecrets } from './secrets.js'

type TelegramClientOptions = {
  botToken: string
  fetchFn?: typeof fetch
  requestTimeoutMs: number
}

type TelegramSetWebhookPayload = {
  allowed_updates: string[]
  drop_pending_updates: boolean
  secret_token: string
  url: string
}

export type TelegramWebhookInfo = {
  last_error_message?: string
  pending_update_count?: number
  url?: string
}

export type TelegramBotIdentity = {
  id: string
  username: string
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function buildTelegramApiUrl(botToken: string, method: string) {
  return new URL(`https://api.telegram.org/bot${botToken}/${method}`)
}

export function createTelegramClient({
  botToken,
  fetchFn = fetch,
  requestTimeoutMs,
}: TelegramClientOptions) {
  async function requestTelegram(method: string, body: unknown) {
    const abortController = new AbortController()
    const timeout = setTimeout(
      () => abortController.abort(new Error('Telegram request timed out.')),
      requestTimeoutMs,
    )
    const requestUrl = buildTelegramApiUrl(botToken, method)

    try {
      const response = await fetchFn(requestUrl, {
        body: JSON.stringify(body),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
        signal: abortController.signal,
      })

      if (!response.ok) {
        throw new Error(
          `Telegram ${method} failed with status ${response.status}.`,
        )
      }

      const payload = await response.json()

      if (!isPlainObject(payload) || payload.ok !== true) {
        throw new Error(`Telegram ${method} returned an unexpected response.`)
      }

      return payload.result
    } catch (error) {
      throw new Error(
        redactTelegramBridgeSecrets(
          error instanceof Error ? error.message : String(error),
          [botToken],
        ),
      )
    } finally {
      clearTimeout(timeout)
    }
  }

  async function sendTextMessage(
    chatId: number | string,
    text: string,
    replyMarkup?: unknown,
  ) {
    await requestTelegram('sendMessage', {
      chat_id: chatId,
      ...(replyMarkup !== undefined ? { reply_markup: replyMarkup } : {}),
      text,
    })
  }

  return {
    async getMe(): Promise<TelegramBotIdentity> {
      const result = await requestTelegram('getMe', {})

      if (!isPlainObject(result)) {
        throw new Error('Telegram getMe returned an invalid bot identity.')
      }

      const username =
        typeof result.username === 'string' ? result.username.trim() : ''
      const id =
        typeof result.id === 'number' || typeof result.id === 'string'
          ? String(result.id)
          : ''

      if (!id || !username) {
        throw new Error('Telegram getMe returned an invalid bot identity.')
      }

      return {
        id,
        username,
      }
    },

    async getWebhookInfo(): Promise<TelegramWebhookInfo> {
      const result = await requestTelegram('getWebhookInfo', {})

      if (!isPlainObject(result)) {
        throw new Error('Telegram getWebhookInfo returned an invalid result.')
      }

      const webhookInfo: TelegramWebhookInfo = {}

      if (typeof result.last_error_message === 'string') {
        webhookInfo.last_error_message = result.last_error_message
      }

      if (typeof result.pending_update_count === 'number') {
        webhookInfo.pending_update_count = result.pending_update_count
      }

      if (typeof result.url === 'string') {
        webhookInfo.url = result.url
      }

      return webhookInfo
    },

    async sendPhoneLinked(chatId: number | string, text: string) {
      await sendTextMessage(chatId, text)
    },

    async sendPhoneNotFound(chatId: number | string, text: string) {
      await sendTextMessage(chatId, text)
    },

    async sendPhonePrompt(chatId: number | string, text: string) {
      await sendTextMessage(chatId, text, {
        keyboard: [[{ request_contact: true, text: 'Отправить телефон' }]],
        one_time_keyboard: true,
        resize_keyboard: true,
      })
    },

    async setWebhook(payload: TelegramSetWebhookPayload) {
      await requestTelegram('setWebhook', payload)
    },
  }
}

export async function getTelegramBotIdentity(
  botToken: string,
  options: { fetchFn?: typeof fetch; requestTimeoutMs: number },
) {
  return createTelegramClient({
    botToken,
    ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
    requestTimeoutMs: options.requestTimeoutMs,
  }).getMe()
}
