import { normalizePhoneToE164 } from '../lib/phone.js'
import type {
  SupportedTelegramMessage,
  TelegramChat,
  TelegramIdentifier,
  TelegramMessage,
  TelegramUpdate,
  TelegramUser,
} from './types.js'

const serviceMessageKeys = [
  'delete_chat_photo',
  'group_chat_created',
  'left_chat_member',
  'message_auto_delete_timer_changed',
  'new_chat_members',
  'new_chat_photo',
  'new_chat_title',
  'pinned_message',
  'supergroup_chat_created',
] as const

export type PrivateAuthorizationMessageClassification =
  | { kind: 'foreign_contact' }
  | { kind: 'needs_phone_prompt' }
  | { kind: 'self_contact'; phone: string }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeText(value: unknown) {
  return String(value ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
    .trim()
}

function hasMessageShape(value: unknown): value is TelegramMessage {
  if (!isPlainObject(value) || !isPlainObject(value.chat)) {
    return false
  }

  return 'id' in value.chat && typeof value.chat.type === 'string'
}

function prefixWithAuthor(authorName: string, value: string) {
  return `${authorName}: ${value}`
}

export function extractSupportedMessage(
  update: unknown,
): SupportedTelegramMessage | null {
  if (!isPlainObject(update) || !hasMessageShape(update.message)) {
    return null
  }

  return {
    message: update.message,
    update: update as TelegramUpdate & { message: TelegramMessage },
  }
}

export function getTelegramChatType(message: TelegramMessage) {
  return normalizeText(message.chat.type) || 'unknown'
}

export function buildAuthorName(user: TelegramUser | null | undefined) {
  const firstName = normalizeText(user?.first_name)
  const lastName = normalizeText(user?.last_name)
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()

  if (fullName) {
    return fullName
  }

  const username = normalizeText(user?.username)

  if (username) {
    return `@${username}`
  }

  return 'Unknown'
}

export function buildGroupSourceId(chatId: TelegramIdentifier) {
  return `tg_group:${String(chatId)}`
}

export function shouldIgnoreMessage(message: TelegramMessage) {
  if (message.from?.is_bot) {
    return true
  }

  if (typeof message.text === 'string' && message.text.trim().startsWith('/')) {
    return true
  }

  return serviceMessageKeys.some((key) => key in message)
}

export function isSelfTelegramContact(message: TelegramMessage) {
  const fromId = message.from?.id
  const contactUserId = message.contact?.user_id

  if (fromId === undefined || contactUserId === undefined) {
    return false
  }

  if (String(fromId) !== String(contactUserId)) {
    return false
  }

  return normalizePhoneToE164(message.contact?.phone_number) !== null
}

export function classifyPrivateAuthorizationMessage(
  message: TelegramMessage,
): PrivateAuthorizationMessageClassification {
  if (isSelfTelegramContact(message)) {
    return {
      kind: 'self_contact',
      phone: normalizePhoneToE164(message.contact?.phone_number) ?? '',
    }
  }

  if (message.contact) {
    return { kind: 'foreign_contact' }
  }

  return { kind: 'needs_phone_prompt' }
}

function buildGroupTitle(chat: TelegramChat) {
  return (
    normalizeText(chat.title) ||
    normalizeText(chat.first_name) ||
    'Telegram Group'
  )
}

export function transformGroupUpdate(update: TelegramUpdate): TelegramUpdate & {
  message: TelegramMessage
} {
  const supportedMessage = extractSupportedMessage(update)

  if (!supportedMessage) {
    throw new Error('Telegram group update must contain a message.')
  }

  const { message } = supportedMessage
  const groupTitle = buildGroupTitle(message.chat)
  const authorName = buildAuthorName(message.from)
  const transformedChat: TelegramChat = {
    ...message.chat,
    first_name: groupTitle,
    original_id: message.chat.id,
    original_type: message.chat.type,
    title: groupTitle,
    type: 'private',
  }
  const transformedSender: TelegramUser = {
    ...(message.from ?? {}),
    first_name: groupTitle,
    id: buildGroupSourceId(message.chat.id),
    is_bot: false,
    last_name: '',
    original_author: message.from ?? null,
    username: '',
  }
  const transformedMessage: TelegramMessage = {
    ...message,
    chat: transformedChat,
    from: transformedSender,
  }

  if (typeof transformedMessage.text === 'string' && transformedMessage.text) {
    transformedMessage.text = prefixWithAuthor(
      authorName,
      transformedMessage.text,
    )
  } else if (
    typeof transformedMessage.caption === 'string' &&
    transformedMessage.caption
  ) {
    transformedMessage.caption = prefixWithAuthor(
      authorName,
      transformedMessage.caption,
    )
  } else {
    transformedMessage.text = prefixWithAuthor(authorName, '[attachment]')
  }

  return {
    ...update,
    message: transformedMessage,
  }
}
