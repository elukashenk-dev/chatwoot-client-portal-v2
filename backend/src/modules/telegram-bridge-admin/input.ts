import { ApiError } from '../../lib/errors.js'

export type TelegramBridgeSetupInput = {
  chatwootAccountIdFromUrl: number
  chatwootTelegramInboxId: number
  telegramBotToken: string
}

function invalidSetupInput(message: string) {
  return new ApiError(400, 'TELEGRAM_BRIDGE_SETUP_INVALID', message)
}

function readPositiveIntegerPathSegment(value: string) {
  const parsed = Number(value)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export function parseChatwootInboxUrl(input: string) {
  let url: URL

  try {
    url = new URL(input.trim())
  } catch {
    throw invalidSetupInput('Укажите ссылку на Telegram источник в Chatwoot.')
  }

  if (url.protocol !== 'https:') {
    throw invalidSetupInput('Ссылка на Telegram источник должна быть HTTPS.')
  }

  const pathSegments = url.pathname.split('/').filter(Boolean)

  if (
    pathSegments.length !== 6 ||
    pathSegments[0] !== 'app' ||
    pathSegments[1] !== 'accounts' ||
    pathSegments[3] !== 'settings' ||
    pathSegments[4] !== 'inboxes'
  ) {
    throw invalidSetupInput('Укажите ссылку на настройки Telegram источника.')
  }

  const accountId = readPositiveIntegerPathSegment(pathSegments[2] ?? '')
  const inboxId = readPositiveIntegerPathSegment(pathSegments[5] ?? '')

  if (!accountId || !inboxId) {
    throw invalidSetupInput('Ссылка на Telegram источник содержит неверный id.')
  }

  return {
    accountId,
    inboxId,
  }
}

function readTelegramBotToken(input: unknown) {
  const telegramBotToken = typeof input === 'string' ? input.trim() : ''

  if (!telegramBotToken) {
    throw invalidSetupInput('Укажите токен Telegram бота.')
  }

  return telegramBotToken
}

export function parseTelegramBridgeSetupInput(
  body: unknown,
): TelegramBridgeSetupInput {
  const rawBody =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {}
  const inboxUrl =
    typeof rawBody.chatwootInboxUrl === 'string'
      ? rawBody.chatwootInboxUrl
      : ''
  const parsedUrl = parseChatwootInboxUrl(inboxUrl)

  return {
    chatwootAccountIdFromUrl: parsedUrl.accountId,
    chatwootTelegramInboxId: parsedUrl.inboxId,
    telegramBotToken: readTelegramBotToken(rawBody.telegramBotToken),
  }
}
