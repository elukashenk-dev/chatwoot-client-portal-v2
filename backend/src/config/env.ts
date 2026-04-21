import { z } from 'zod'

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

const optionalPositiveInt = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  if (typeof value === 'string') {
    return Number(value)
  }

  return value
}, z.number().int().positive().optional())

const booleanFromStringWithDefaultFalse = z.preprocess((value) => {
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
}, z.boolean()).default(false)

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3301),
  APP_ORIGIN: z.string().url().default('http://127.0.0.1:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SESSION_COOKIE_NAME: z.string().min(1).default('portal_session'),
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must contain at least 32 characters'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().max(90).default(14),
  CHATWOOT_BASE_URL: optionalUrlString,
  CHATWOOT_ACCOUNT_ID: optionalPositiveInt,
  CHATWOOT_API_ACCESS_TOKEN: optionalNonEmptyString,
  SMTP_HOST: optionalNonEmptyString,
  SMTP_PORT: optionalPositiveInt.default(1025),
  SMTP_SECURE: booleanFromStringWithDefaultFalse,
  SMTP_USER: optionalNonEmptyString,
  SMTP_PASS: optionalNonEmptyString,
  SMTP_FROM: optionalNonEmptyString,
})
  .superRefine((env, context) => {
    const hasChatwootConfig = Boolean(
      env.CHATWOOT_BASE_URL ||
        env.CHATWOOT_ACCOUNT_ID !== undefined ||
        env.CHATWOOT_API_ACCESS_TOKEN,
    )

    if (hasChatwootConfig) {
      if (!env.CHATWOOT_BASE_URL) {
        context.addIssue({
          code: 'custom',
          message: 'CHATWOOT_BASE_URL is required when Chatwoot integration is configured',
          path: ['CHATWOOT_BASE_URL'],
        })
      }

      if (!env.CHATWOOT_ACCOUNT_ID) {
        context.addIssue({
          code: 'custom',
          message: 'CHATWOOT_ACCOUNT_ID is required when Chatwoot integration is configured',
          path: ['CHATWOOT_ACCOUNT_ID'],
        })
      }

      if (!env.CHATWOOT_API_ACCESS_TOKEN) {
        context.addIssue({
          code: 'custom',
          message:
            'CHATWOOT_API_ACCESS_TOKEN is required when Chatwoot integration is configured',
          path: ['CHATWOOT_API_ACCESS_TOKEN'],
        })
      }
    }

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

      if ((env.SMTP_USER && !env.SMTP_PASS) || (!env.SMTP_USER && env.SMTP_PASS)) {
        context.addIssue({
          code: 'custom',
          message: 'SMTP_USER and SMTP_PASS must be provided together',
          path: ['SMTP_USER'],
        })
      }
    }
  })

export type AppEnv = z.infer<typeof envSchema>

export function loadEnv(rawEnv: NodeJS.ProcessEnv = process.env): AppEnv {
  return envSchema.parse(rawEnv)
}
