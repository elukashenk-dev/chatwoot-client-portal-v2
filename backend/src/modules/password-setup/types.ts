import type { SmtpEmailDelivery } from '../../integrations/email/smtp.js'
import type { AuthenticatedPortalUser, AuthService } from '../auth/service.js'
import type { PasswordSetupRepository } from './repository.js'

export type PasswordSetupScope = {
  email: string
  userId: number
}

export type CreatePasswordSetupServiceOptions = {
  authService: Pick<AuthService, 'issueSessionForUser'>
  emailDelivery: Pick<SmtpEmailDelivery, 'send'>
  now?: () => Date
  passwordSetupRepository: PasswordSetupRepository
  tenantId: number
}

export type PasswordSetupRequestResult = {
  email: string
  expiresInSeconds: number
  nextStep: 'verify_code'
  purpose: 'password_setup'
  resendAvailableInSeconds: number
  result: 'password_setup_requested'
}

export type PasswordSetupVerifyResult = {
  continuationExpiresInSeconds: number
  continuationToken: string
  email: string
  nextStep: 'set_password'
  purpose: 'password_setup'
  result: 'password_setup_verified'
}

export type PasswordSetupCompletedSession = {
  nextStep: 'chat'
  purpose: 'password_setup'
  result: 'password_setup_completed'
  session: { expiresAt: Date }
  sessionToken: string
  user: AuthenticatedPortalUser
}
