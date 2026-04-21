import nodemailer from 'nodemailer'

import type { AppEnv } from '../../config/env.js'

export type EmailMessage = {
  subject: string
  text: string
  to: string
}

export class SmtpEmailDeliveryConfigurationError extends Error {
  constructor(message = 'SMTP delivery is not configured.') {
    super(message)

    this.name = 'SmtpEmailDeliveryConfigurationError'
  }
}

export class SmtpEmailDeliveryError extends Error {
  constructor(message = 'SMTP delivery failed.') {
    super(message)

    this.name = 'SmtpEmailDeliveryError'
  }
}

type CreateSmtpEmailDeliveryOptions = {
  env: Pick<
    AppEnv,
    'SMTP_FROM' | 'SMTP_HOST' | 'SMTP_PASS' | 'SMTP_PORT' | 'SMTP_SECURE' | 'SMTP_USER'
  >
  createTransport?: typeof nodemailer.createTransport
}

export function createSmtpEmailDelivery({
  env,
  createTransport = nodemailer.createTransport,
}: CreateSmtpEmailDeliveryOptions) {
  const isConfigured = Boolean(env.SMTP_HOST && env.SMTP_FROM)
  const transport = isConfigured
    ? createTransport({
        auth:
          env.SMTP_USER && env.SMTP_PASS
            ? {
                pass: env.SMTP_PASS,
                user: env.SMTP_USER,
              }
            : undefined,
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
      })
    : null

  return {
    async send(message: EmailMessage) {
      if (!transport || !env.SMTP_FROM) {
        throw new SmtpEmailDeliveryConfigurationError()
      }

      try {
        await transport.sendMail({
          from: env.SMTP_FROM,
          subject: message.subject,
          text: message.text,
          to: message.to,
        })
      } catch {
        throw new SmtpEmailDeliveryError()
      }
    },
  }
}

export type SmtpEmailDelivery = ReturnType<typeof createSmtpEmailDelivery>
