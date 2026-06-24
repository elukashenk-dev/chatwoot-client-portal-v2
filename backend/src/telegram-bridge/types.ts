export type TelegramIdentifier = number | string

export type TelegramUser = {
  first_name?: string
  id?: TelegramIdentifier
  is_bot?: boolean
  language_code?: string
  last_name?: string
  original_author?: unknown
  username?: string
  [key: string]: unknown
}

export type TelegramChat = {
  first_name?: string
  id: TelegramIdentifier
  original_id?: TelegramIdentifier
  original_type?: string
  title?: string
  type: string
  [key: string]: unknown
}

export type TelegramContact = {
  first_name?: string
  last_name?: string
  phone_number?: string
  user_id?: TelegramIdentifier
  [key: string]: unknown
}

export type TelegramMessage = {
  caption?: string
  chat: TelegramChat
  contact?: TelegramContact
  date?: number
  from?: TelegramUser
  message_id?: number
  text?: string
  [key: string]: unknown
}

export type TelegramUpdate = {
  edited_message?: TelegramMessage
  message?: TelegramMessage
  update_id?: number
  [key: string]: unknown
}

export type SupportedTelegramMessage = {
  message: TelegramMessage
  update: TelegramUpdate & { message: TelegramMessage }
}
