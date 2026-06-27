import type { ChatwootClient } from '../../integrations/chatwoot/client.js'
import type { SmtpEmailDelivery } from '../../integrations/email/smtp.js'
import type { AuthService } from '../auth/service.js'
import type { CustomerAccessLegalDocumentVersions } from '../legal-documents/service.js'
import { acceptLegal } from './acceptLegal.js'
import type { PasswordlessLoginRepository } from './repository.js'
import { requestLoginCode } from './requestLoginCode.js'
import { verifyLoginCode } from './verifyLoginCode.js'

type CreatePasswordlessLoginServiceOptions = {
  authService: Pick<AuthService, 'issueSessionForUser'>
  chatwootClient: Pick<ChatwootClient, 'findContactByEmail'>
  emailDelivery: Pick<SmtpEmailDelivery, 'send'>
  legalDocumentsReader: {
    getActiveVersionsForCustomerAccess(): Promise<CustomerAccessLegalDocumentVersions>
  }
  now?: () => Date
  passwordlessLoginRepository: PasswordlessLoginRepository
  tenantId: number
}

export function createPasswordlessLoginService({
  authService,
  chatwootClient,
  emailDelivery,
  legalDocumentsReader,
  now = () => new Date(),
  passwordlessLoginRepository,
  tenantId,
}: CreatePasswordlessLoginServiceOptions) {
  return {
    acceptLegal(input: {
      continuationToken: string
      email: string
      ipAddress?: string | null
      personalDataConsentAccepted: true
      termsAccepted: true
      userAgent?: string | null
    }) {
      return acceptLegal({
        ...input,
        authService,
        legalDocumentsReader,
        now,
        passwordlessLoginRepository,
        tenantId,
      })
    },

    requestLoginCode(input: { email: string }) {
      return requestLoginCode({
        ...input,
        chatwootClient,
        emailDelivery,
        now,
        passwordlessLoginRepository,
      })
    },

    verifyLoginCode(input: { code: string; email: string }) {
      return verifyLoginCode({
        ...input,
        authService,
        now,
        passwordlessLoginRepository,
        tenantId,
      })
    },
  }
}

export type PasswordlessLoginService = ReturnType<
  typeof createPasswordlessLoginService
>
