import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DatabaseClient } from '../../db/client.js'
import { ChatwootClientRequestError } from '../../integrations/chatwoot/client.js'
import { ApiError } from '../../lib/errors.js'
import { testEnv } from '../../test/appTestHelpers.js'
import { createAuthService } from '../auth/service.js'
import { createPortalUsersRepository } from '../portal-users/repository.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import { seedTestTenant } from '../../test/testTenants.js'
import { createRegistrationRepository } from './repository.js'
import { createRegistrationService } from './service.js'

const acceptedRegistrationLegal = {
  personalDataConsentAccepted: true,
  requestIp: '203.0.113.10',
  termsAccepted: true,
  userAgent: 'Mozilla/5.0',
} as const
const activeLegalDocumentVersions = {
  privacyPolicyVersion: 'privacy-upload-v9',
  termsVersion: 'terms-upload-v7',
}
const supportPhoneDisplay = '+7 (846) 211-11-11'

type RegistrationServiceOptions = Parameters<
  typeof createRegistrationService
>[0]
type RegistrationServiceTestOptions = Omit<
  RegistrationServiceOptions,
  'authService' | 'legalDocumentsReader' | 'supportContactReader' | 'tenantId'
> &
  Partial<
    Pick<
      RegistrationServiceOptions,
      'authService' | 'legalDocumentsReader' | 'supportContactReader'
    >
  >

function createDefaultLegalDocumentsReader() {
  return {
    getActiveVersionsForRegistration: vi
      .fn()
      .mockResolvedValue(activeLegalDocumentVersions),
  }
}

function createDefaultSupportContactReader() {
  return {
    getPublicBranding: vi.fn().mockResolvedValue({
      branding: {
        supportContact: {
          phoneDisplay: supportPhoneDisplay,
        },
      },
    }),
  }
}

describe('registration service legal/support preflight', () => {
  let database: DatabaseClient
  let tenantId: number

  function createRegistrationServiceForTest(
    options: RegistrationServiceTestOptions,
  ) {
    const {
      authService = createAuthService({
        db: database.db,
        env: testEnv,
        ...(options.now ? { now: options.now } : {}),
      }),
      legalDocumentsReader = createDefaultLegalDocumentsReader(),
      supportContactReader = createDefaultSupportContactReader(),
      ...serviceOptions
    } = options

    return createRegistrationService({
      ...serviceOptions,
      authService,
      legalDocumentsReader,
      supportContactReader,
      tenantId,
    })
  }

  beforeEach(async () => {
    database = await createTestDatabase()
    tenantId = (await seedTestTenant(database.db)).id
  })

  afterEach(async () => {
    await database.close()
  })

  it('rejects registration when Chatwoot contact is not found', async () => {
    const service = createRegistrationServiceForTest({
      chatwootClient: {
        findContactByEmail: vi.fn().mockResolvedValue(null),
      },
      emailDelivery: {
        send: vi.fn(),
      },
      now: () => new Date('2026-04-21T12:00:00.000Z'),
      portalUsersRepository: createPortalUsersRepository(database.db),
      registrationRepository: createRegistrationRepository(database.db, {
        tenantId,
      }),
    })

    await expect(
      service.requestVerification({
        email: 'name@company.ru',
        fullName: 'Portal User',
        legalAcceptance: acceptedRegistrationLegal,
      }),
    ).rejects.toMatchObject({
      code: 'REGISTRATION_CONTACT_NOT_FOUND',
      message: `Мы не нашли профиль с таким email. Позвоните по тел: ${supportPhoneDisplay}.`,
      statusCode: 403,
    })
  })

  it('uses generic support copy when missing-contact support phone is not configured', async () => {
    const service = createRegistrationServiceForTest({
      chatwootClient: {
        findContactByEmail: vi.fn().mockResolvedValue(null),
      },
      emailDelivery: {
        send: vi.fn(),
      },
      now: () => new Date('2026-04-21T12:00:00.000Z'),
      portalUsersRepository: createPortalUsersRepository(database.db),
      registrationRepository: createRegistrationRepository(database.db, {
        tenantId,
      }),
      supportContactReader: {
        getPublicBranding: vi.fn().mockResolvedValue({
          branding: {
            supportContact: {
              phoneDisplay: null,
            },
          },
        }),
      },
    })

    await expect(
      service.requestVerification({
        email: 'name@company.ru',
        fullName: 'Portal User',
        legalAcceptance: acceptedRegistrationLegal,
      }),
    ).rejects.toMatchObject({
      code: 'REGISTRATION_CONTACT_NOT_FOUND',
      message: 'Мы не нашли профиль с таким email. Обратитесь в поддержку.',
      statusCode: 403,
    })
  })

  it('rejects registration before Chatwoot when legal documents are not configured', async () => {
    const findContactByEmail = vi.fn()
    const sendEmail = vi.fn()
    const service = createRegistrationServiceForTest({
      chatwootClient: {
        findContactByEmail,
      },
      emailDelivery: {
        send: sendEmail,
      },
      legalDocumentsReader: {
        getActiveVersionsForRegistration: vi
          .fn()
          .mockRejectedValue(
            new ApiError(
              503,
              'LEGAL_DOCUMENTS_NOT_CONFIGURED',
              'Регистрация временно недоступна: юридические документы еще не загружены.',
            ),
          ),
      },
      now: () => new Date('2026-04-21T12:00:00.000Z'),
      portalUsersRepository: createPortalUsersRepository(database.db),
      registrationRepository: createRegistrationRepository(database.db, {
        tenantId,
      }),
    })

    await expect(
      service.requestVerification({
        email: 'name@company.ru',
        fullName: 'Portal User',
        legalAcceptance: acceptedRegistrationLegal,
      }),
    ).rejects.toMatchObject({
      code: 'LEGAL_DOCUMENTS_NOT_CONFIGURED',
      statusCode: 503,
    })
    expect(findContactByEmail).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('requires Chatwoot eligibility when there is no active pending verification', async () => {
    const sendEmail = vi.fn()
    const service = createRegistrationServiceForTest({
      chatwootClient: {
        findContactByEmail: vi
          .fn()
          .mockRejectedValue(new ChatwootClientRequestError()),
      },
      emailDelivery: {
        send: sendEmail,
      },
      now: () => new Date('2026-04-21T12:00:00.000Z'),
      portalUsersRepository: createPortalUsersRepository(database.db),
      registrationRepository: createRegistrationRepository(database.db, {
        tenantId,
      }),
    })

    await expect(
      service.requestVerification({
        email: 'name@company.ru',
        fullName: 'Portal User',
        legalAcceptance: acceptedRegistrationLegal,
      }),
    ).rejects.toMatchObject({
      code: 'CHATWOOT_UNAVAILABLE',
      statusCode: 502,
    })
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
