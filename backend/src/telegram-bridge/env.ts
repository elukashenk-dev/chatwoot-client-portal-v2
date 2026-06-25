import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnvFile } from 'node:process'

import { z } from 'zod'

let didLoadLocalEnvFile = false

function loadLocalEnvFileIfPresent() {
  if (didLoadLocalEnvFile) {
    return
  }

  didLoadLocalEnvFile = true

  const candidatePaths = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '..', '.env'),
  ]

  for (const envFilePath of candidatePaths) {
    if (existsSync(envFilePath)) {
      loadEnvFile(envFilePath)
      return
    }
  }
}

const trimmedRequiredString = (fieldName: string) =>
  z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z.string().min(1, `${fieldName} is required`),
  )

const trimmedStringWithDefault = (defaultValue: string) =>
  z.preprocess((value) => {
    if (typeof value !== 'string') {
      return value
    }

    const trimmedValue = value.trim()

    return trimmedValue === '' ? undefined : trimmedValue
  }, z.string().min(1).default(defaultValue))

const requiredPositiveInt = (fieldName: string) =>
  z.coerce.number().int().positive(`${fieldName} must be a positive integer`)

const optionalPositiveIntWithDefault = (
  fieldName: string,
  defaultValue: number,
) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === '') {
      return undefined
    }

    return value
  }, requiredPositiveInt(fieldName).default(defaultValue))

const httpUrlWithoutTrailingSlash = (fieldName: string) =>
  z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z
      .string()
      .refine((value) => {
        try {
          return ['http:', 'https:'].includes(new URL(value).protocol)
        } catch {
          return false
        }
      }, {
        message: `${fieldName} must be a valid http or https URL`,
      })
      .transform((value) => value.replace(/\/+$/, '')),
  )

const telegramBridgeEnvSchema = z.object({
  DATABASE_URL: trimmedRequiredString('DATABASE_URL'),
  PORTAL_TENANT_SECRET_KEY: trimmedRequiredString('PORTAL_TENANT_SECRET_KEY'),
  TELEGRAM_BRIDGE_MAX_BODY_BYTES: optionalPositiveIntWithDefault(
    'TELEGRAM_BRIDGE_MAX_BODY_BYTES',
    1_048_576,
  ),
  TELEGRAM_BRIDGE_PHONE_LINKED_TEXT: trimmedStringWithDefault(
    'Спасибо, контакт найден. Теперь можете отправить сообщение.',
  ),
  TELEGRAM_BRIDGE_PHONE_NOT_FOUND_TEXT: trimmedStringWithDefault(
    'Не удалось найти контакт с этим номером. Проверьте номер или напишите менеджеру.',
  ),
  TELEGRAM_BRIDGE_PHONE_PROMPT_TEXT: trimmedStringWithDefault(
    'Пожалуйста, отправьте номер телефона кнопкой ниже, чтобы мы могли найти ваш контакт.',
  ),
  TELEGRAM_BRIDGE_PORT: requiredPositiveInt('TELEGRAM_BRIDGE_PORT'),
  TELEGRAM_BRIDGE_PROCESSING_STALE_MS: optionalPositiveIntWithDefault(
    'TELEGRAM_BRIDGE_PROCESSING_STALE_MS',
    600_000,
  ),
  TELEGRAM_BRIDGE_PUBLIC_BASE_URL: httpUrlWithoutTrailingSlash(
    'TELEGRAM_BRIDGE_PUBLIC_BASE_URL',
  ),
  TELEGRAM_BRIDGE_REQUEST_TIMEOUT_MS: optionalPositiveIntWithDefault(
    'TELEGRAM_BRIDGE_REQUEST_TIMEOUT_MS',
    10_000,
  ),
})

export type TelegramBridgeEnv = z.infer<typeof telegramBridgeEnvSchema>

const telegramBridgeWebhookInfoEnvSchema = telegramBridgeEnvSchema.pick({
  TELEGRAM_BRIDGE_PUBLIC_BASE_URL: true,
  TELEGRAM_BRIDGE_REQUEST_TIMEOUT_MS: true,
})

export type TelegramBridgeWebhookInfoEnv = z.infer<
  typeof telegramBridgeWebhookInfoEnvSchema
>

export function loadTelegramBridgeEnv(
  rawEnv: NodeJS.ProcessEnv = process.env,
): TelegramBridgeEnv {
  if (rawEnv === process.env) {
    loadLocalEnvFileIfPresent()
  }

  return telegramBridgeEnvSchema.parse(rawEnv)
}

export function loadTelegramBridgeWebhookInfoEnv(
  rawEnv: NodeJS.ProcessEnv = process.env,
): TelegramBridgeWebhookInfoEnv {
  if (rawEnv === process.env) {
    loadLocalEnvFileIfPresent()
  }

  return telegramBridgeWebhookInfoEnvSchema.parse(rawEnv)
}
