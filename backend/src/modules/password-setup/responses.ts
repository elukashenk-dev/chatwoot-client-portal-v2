import type { EmailMessage } from '../../integrations/email/smtp.js'
import { PASSWORD_SETUP_PURPOSE } from './repository.js'
import type {
  PasswordSetupCompletedSession,
  PasswordSetupRequestResult,
  PasswordSetupVerifyResult,
} from './types.js'

export function buildSetupEmail({ code }: { code: string }): EmailMessage {
  return {
    subject: 'Код для создания пароля в Client Portal',
    text: [
      'Ваш код для создания пароля в Client Portal:',
      '',
      code,
      '',
      'Код действует 15 минут.',
      'Если вы не запрашивали создание пароля, обратитесь в поддержку.',
    ].join('\n'),
    to: '',
  }
}

function calculateSecondsUntil(target: Date, now: Date) {
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 1000))
}

export function buildRequestResponse({
  email,
  expiresAt,
  now,
  resendNotBefore,
}: {
  email: string
  expiresAt: Date
  now: Date
  resendNotBefore: Date
}): PasswordSetupRequestResult {
  return {
    email,
    expiresInSeconds: calculateSecondsUntil(expiresAt, now),
    nextStep: 'verify_code',
    purpose: PASSWORD_SETUP_PURPOSE,
    resendAvailableInSeconds: calculateSecondsUntil(resendNotBefore, now),
    result: 'password_setup_requested',
  }
}

export function buildVerifyResponse({
  continuationToken,
  continuationTokenExpiresAt,
  email,
  now,
}: {
  continuationToken: string
  continuationTokenExpiresAt: Date
  email: string
  now: Date
}): PasswordSetupVerifyResult {
  return {
    continuationExpiresInSeconds: calculateSecondsUntil(
      continuationTokenExpiresAt,
      now,
    ),
    continuationToken,
    email,
    nextStep: 'set_password',
    purpose: PASSWORD_SETUP_PURPOSE,
    result: 'password_setup_verified',
  }
}

export function buildCompletedResponse(
  input: Pick<
    PasswordSetupCompletedSession,
    'session' | 'sessionToken' | 'user'
  >,
): PasswordSetupCompletedSession {
  return {
    nextStep: 'chat',
    purpose: PASSWORD_SETUP_PURPOSE,
    result: 'password_setup_completed',
    ...input,
  }
}
