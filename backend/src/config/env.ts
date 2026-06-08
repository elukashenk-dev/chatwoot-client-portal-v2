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

const optionalNonEmptyString = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  const trimmedValue = value.trim()

  return trimmedValue === '' ? undefined : trimmedValue
}, z.string().optional())

const optionalUrlString = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  const trimmedValue = value.trim()

  return trimmedValue === '' ? undefined : trimmedValue
}, z.string().url().optional())

const optionalUrlList = z.preprocess((value) => {
  if (value === undefined || value === null) {
    return []
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
  }

  return value
}, z.array(z.string().url()).default([]))

const DEFAULT_PUSH_SUBSCRIPTION_ALLOWED_ORIGINS = [
  'https://fcm.googleapis.com',
  'https://updates.push.services.mozilla.com',
  'https://web.push.apple.com',
]

const pushSubscriptionAllowedOrigins = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === '') {
      return DEFAULT_PUSH_SUBSCRIPTION_ALLOWED_ORIGINS
    }

    if (typeof value === 'string') {
      return value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
    }

    return value
  },
  z
    .array(z.string().url())
    .default([...DEFAULT_PUSH_SUBSCRIPTION_ALLOWED_ORIGINS]),
)

const optionalPositiveInt = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  if (typeof value === 'string') {
    return Number(value)
  }

  return value
}, z.number().int().positive().optional())

const booleanFromStringWithDefaultFalse = z
  .preprocess((value) => {
    if (value === undefined || value === null || value === '') {
      return false
    }

    if (typeof value === 'string') {
      if (value === 'true') {
        return true
      }

      if (value === 'false') {
        return false
      }
    }

    return value
  }, z.boolean())
  .default(false)

const booleanFromStringWithDefaultTrue = z
  .preprocess((value) => {
    if (value === undefined || value === null || value === '') {
      return true
    }

    if (typeof value === 'string') {
      if (value === 'true') {
        return true
      }

      if (value === 'false') {
        return false
      }
    }

    return value
  }, z.boolean())
  .default(true)

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3301),
    PORTAL_TRUST_PROXY: booleanFromStringWithDefaultFalse,
    APP_ORIGIN: z.string().url().default('http://127.0.0.1:5173'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    ADMIN_SESSION_COOKIE_NAME: z
      .string()
      .min(1)
      .default('portal_admin_session'),
    SESSION_COOKIE_NAME: z.string().min(1).default('portal_session'),
    SESSION_SECRET: z
      .string()
      .min(32, 'SESSION_SECRET must contain at least 32 characters'),
    SESSION_TTL_DAYS: z.coerce.number().int().positive().max(90).default(14),
    AUTH_RATE_LIMIT_MAX: optionalPositiveInt.default(5),
    AUTH_RATE_LIMIT_WINDOW_MS: optionalPositiveInt.default(60_000),
    CHATWOOT_REQUEST_TIMEOUT_MS: optionalPositiveInt,
    CHAT_ATTACHMENT_PROXY_ALLOWED_ORIGINS: optionalUrlList,
    PORTAL_TENANT_SECRET_KEY: optionalNonEmptyString,
    DEFAULT_TENANT_SLUG: optionalNonEmptyString,
    DEFAULT_TENANT_DISPLAY_NAME: optionalNonEmptyString,
    DEFAULT_TENANT_PRIMARY_DOMAIN: optionalNonEmptyString,
    DEFAULT_TENANT_PUBLIC_BASE_URL: optionalUrlString,
    DEFAULT_TENANT_CHATWOOT_BASE_URL: optionalUrlString,
    DEFAULT_TENANT_CHATWOOT_ACCOUNT_ID: optionalPositiveInt,
    DEFAULT_TENANT_CHATWOOT_PORTAL_INBOX_ID: optionalPositiveInt,
    DEFAULT_TENANT_CHATWOOT_API_ACCESS_TOKEN: optionalNonEmptyString,
    DEFAULT_TENANT_CHATWOOT_ADMIN_VERIFICATION_TOKEN: optionalNonEmptyString,
    DEFAULT_TENANT_CHATWOOT_WEBHOOK_SECRET: optionalNonEmptyString,
    SMTP_HOST: optionalNonEmptyString,
    SMTP_PORT: optionalPositiveInt.default(1025),
    SMTP_SECURE: booleanFromStringWithDefaultFalse,
    SMTP_USER: optionalNonEmptyString,
    SMTP_PASS: optionalNonEmptyString,
    SMTP_FROM: optionalNonEmptyString,
    PUSH_VAPID_PUBLIC_KEY: optionalNonEmptyString,
    PUSH_VAPID_PRIVATE_KEY: optionalNonEmptyString,
    PUSH_VAPID_SUBJECT: optionalNonEmptyString,
    PUSH_VAPID_KEY_ID: optionalNonEmptyString,
    PUSH_SUBSCRIPTION_ALLOWED_ORIGINS: pushSubscriptionAllowedOrigins,
    BRANDING_ASSET_STORAGE_ACCESS_KEY_ID: optionalNonEmptyString,
    BRANDING_ASSET_STORAGE_BUCKET: optionalNonEmptyString,
    BRANDING_ASSET_STORAGE_ENDPOINT: optionalUrlString,
    BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE: booleanFromStringWithDefaultTrue,
    BRANDING_ASSET_STORAGE_REGION: optionalNonEmptyString.default('us-east-1'),
    BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY: optionalNonEmptyString,
  })
  .superRefine((env, context) => {
    const hasSmtpConfig = Boolean(
      env.SMTP_HOST || env.SMTP_FROM || env.SMTP_USER || env.SMTP_PASS,
    )

    if (hasSmtpConfig) {
      if (!env.SMTP_HOST) {
        context.addIssue({
          code: 'custom',
          message: 'SMTP_HOST is required when SMTP delivery is configured',
          path: ['SMTP_HOST'],
        })
      }

      if (!env.SMTP_FROM) {
        context.addIssue({
          code: 'custom',
          message: 'SMTP_FROM is required when SMTP delivery is configured',
          path: ['SMTP_FROM'],
        })
      }

      if (
        (env.SMTP_USER && !env.SMTP_PASS) ||
        (!env.SMTP_USER && env.SMTP_PASS)
      ) {
        context.addIssue({
          code: 'custom',
          message: 'SMTP_USER and SMTP_PASS must be provided together',
          path: ['SMTP_USER'],
        })
      }
    }

    const hasPushVapidKey = Boolean(
      env.PUSH_VAPID_PUBLIC_KEY || env.PUSH_VAPID_PRIVATE_KEY,
    )

    if (hasPushVapidKey) {
      if (!env.PUSH_VAPID_PUBLIC_KEY || !env.PUSH_VAPID_PRIVATE_KEY) {
        context.addIssue({
          code: 'custom',
          message:
            'PUSH_VAPID_PUBLIC_KEY and PUSH_VAPID_PRIVATE_KEY must be provided together',
          path: ['PUSH_VAPID_PUBLIC_KEY'],
        })
      }

      if (!env.PUSH_VAPID_SUBJECT) {
        context.addIssue({
          code: 'custom',
          message:
            'PUSH_VAPID_SUBJECT is required when Web Push VAPID keys are configured',
          path: ['PUSH_VAPID_SUBJECT'],
        })
      }
    }

    const brandingStorageFields = [
      'BRANDING_ASSET_STORAGE_ACCESS_KEY_ID',
      'BRANDING_ASSET_STORAGE_BUCKET',
      'BRANDING_ASSET_STORAGE_ENDPOINT',
      'BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY',
    ] as const
    const hasBrandingStorageConfig = brandingStorageFields.some((field) =>
      Boolean(env[field]),
    )
    const requiresBrandingStorageConfig =
      env.NODE_ENV === 'production' || hasBrandingStorageConfig

    if (requiresBrandingStorageConfig) {
      for (const field of brandingStorageFields) {
        if (!env[field]) {
          context.addIssue({
            code: 'custom',
            message: `${field} is required when branding asset storage is configured`,
            path: [field],
          })
        }
      }
    }
  })

export type AppEnv = z.infer<typeof envSchema>

export function loadEnv(rawEnv: NodeJS.ProcessEnv = process.env): AppEnv {
  if (rawEnv === process.env) {
    loadLocalEnvFileIfPresent()
  }

  return envSchema.parse(rawEnv)
}
