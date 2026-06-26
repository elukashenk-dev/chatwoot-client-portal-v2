import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'

import type { DatabaseClient } from '../../db/client.js'
import {
  portalLegalAcceptances,
  portalUserContactLinks,
} from '../../db/schema.js'
import { testEnv } from '../../test/appTestHelpers.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import { seedTestTenant } from '../../test/testTenants.js'
import { createAuthService } from '../auth/service.js'
import { createPortalUsersRepository } from '../portal-users/repository.js'
import { hashRegistrationContinuationToken } from './completionReadiness.js'
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

function extractVerificationCode(text: string) {
  const match = text.match(/\b\d{6}\b/)

  if (!match) {
    throw new Error('Expected a six-digit verification code in the email body.')
  }

  return match[0]
}

describe('registration service completion', () => {
  let database: DatabaseClient
  let tenantId: number

  beforeEach(async () => {
    database = await createTestDatabase()
    tenantId = (await seedTestTenant(database.db)).id
  })

  afterEach(async () => {
    await database.close()
  })

  it('completes registration after verification and creates a portal user session', async () => {
    const sendEmail = vi.fn().mockResolvedValue(undefined)
    const portalUsersRepository = createPortalUsersRepository(database.db)
    const registrationRepository = createRegistrationRepository(database.db, {
      tenantId,
    })
    const now = new Date('2026-04-21T12:00:00.000Z')
    const service = createRegistrationService({
      authService: createAuthService({
        db: database.db,
        env: testEnv,
        now: () => now,
      }),
      chatwootClient: {
        findContactByEmail: vi.fn().mockResolvedValue({
          email: 'name@company.ru',
          id: 44,
          name: 'Portal User',
        }),
      },
      emailDelivery: {
        send: sendEmail,
      },
      legalDocumentsReader: {
        getActiveVersionsForRegistration: vi
          .fn()
          .mockResolvedValue(activeLegalDocumentVersions),
      },
      now: () => now,
      portalUsersRepository,
      registrationRepository,
      supportContactReader: {
        getPublicBranding: vi.fn().mockResolvedValue({
          branding: {
            supportContact: {
              phoneDisplay: '+7 (846) 211-11-11',
            },
          },
        }),
      },
      tenantId,
    })

    await service.requestVerification({
      email: 'name@company.ru',
      fullName: 'Portal User',
      legalAcceptance: acceptedRegistrationLegal,
    })

    const emailMessage = sendEmail.mock.calls[0]?.[0]
    const verificationCode = extractVerificationCode(emailMessage?.text ?? '')
    const verification = await service.confirmVerification({
      code: verificationCode,
      email: 'name@company.ru',
    })

    const result = await service.setPassword({
      continuationToken: verification.continuationToken,
      email: 'name@company.ru',
      newPassword: 'PortalPass123',
    })

    expect(result).toEqual({
      nextStep: 'chat',
      purpose: 'registration',
      result: 'registration_completed',
      session: {
        expiresAt: new Date('2026-05-21T12:00:00.000Z'),
      },
      sessionToken: expect.any(String),
      user: {
        email: 'name@company.ru',
        fullName: 'Portal User',
        id: expect.any(Number),
        passwordConfigured: true,
      },
    })

    const createdUser = await portalUsersRepository.findByEmail({
      email: 'name@company.ru',
      tenantId,
    })

    expect(createdUser).toMatchObject({
      email: 'name@company.ru',
      fullName: 'Portal User',
      isActive: true,
    })

    await expect(
      database.db
        .select({
          chatwootContactId: portalUserContactLinks.chatwootContactId,
          userId: portalUserContactLinks.userId,
        })
        .from(portalUserContactLinks)
        .where(eq(portalUserContactLinks.tenantId, tenantId)),
    ).resolves.toEqual([
      {
        chatwootContactId: 44,
        userId: createdUser?.id,
      },
    ])

    await expect(
      database.db
        .select({
          email: portalLegalAcceptances.email,
          portalUserId: portalLegalAcceptances.portalUserId,
          purpose: portalLegalAcceptances.purpose,
        })
        .from(portalLegalAcceptances)
        .where(eq(portalLegalAcceptances.tenantId, tenantId)),
    ).resolves.toEqual([
      expect.objectContaining({
        email: 'name@company.ru',
        portalUserId: createdUser?.id,
        purpose: 'registration',
      }),
    ])

    const latestRecord =
      await registrationRepository.findLatestVerificationByEmail(
        'name@company.ru',
      )

    expect(latestRecord).toMatchObject({
      continuationTokenHash: null,
      status: 'consumed',
    })
  })

  it('rejects unready set-password completion before hashing the password', async () => {
    const requestedAt = new Date('2026-04-21T12:00:00.000Z')
    const portalUsersRepository = createPortalUsersRepository(database.db)
    const registrationRepository = createRegistrationRepository(database.db, {
      tenantId,
    })
    const secretHasher = vi.fn().mockResolvedValue('hashed-password')
    const service = createRegistrationService({
      authService: createAuthService({
        db: database.db,
        env: testEnv,
        now: () => requestedAt,
      }),
      chatwootClient: {
        findContactByEmail: vi.fn(),
      },
      emailDelivery: {
        send: vi.fn(),
      },
      legalDocumentsReader: {
        getActiveVersionsForRegistration: vi
          .fn()
          .mockResolvedValue(activeLegalDocumentVersions),
      },
      now: () => requestedAt,
      portalUsersRepository,
      registrationRepository,
      secretHasher,
      supportContactReader: {
        getPublicBranding: vi.fn().mockResolvedValue({
          branding: {
            supportContact: {
              phoneDisplay: '+7 (846) 211-11-11',
            },
          },
        }),
      },
      tenantId,
    })

    await expect(
      service.setPassword({
        continuationToken: 'missing-continuation-token',
        email: 'missing@company.ru',
        newPassword: 'PortalPass123',
      }),
    ).rejects.toMatchObject({
      code: 'REGISTRATION_VERIFICATION_REQUIRED',
      statusCode: 409,
    })
    expect(secretHasher).not.toHaveBeenCalled()

    const pendingRecord = await registrationRepository.createPendingVerification(
      {
        chatwootContactId: 44,
        codeHash: 'code-hash',
        email: 'name@company.ru',
        expiresAt: new Date(requestedAt.getTime() + 15 * 60 * 1000),
        fullName: 'Portal User',
        lastSentAt: requestedAt,
        resendNotBefore: requestedAt,
      },
    )

    await registrationRepository.verifyPendingVerification({
      continuationTokenExpiresAt: new Date(
        requestedAt.getTime() + 15 * 60 * 1000,
      ),
      continuationTokenHash: hashRegistrationContinuationToken(
        'valid-continuation-token',
      ),
      recordId: pendingRecord.id,
      updatedAt: requestedAt,
      verifiedAt: requestedAt,
    })

    await expect(
      service.setPassword({
        continuationToken: 'invalid-continuation-token',
        email: 'name@company.ru',
        newPassword: 'PortalPass123',
      }),
    ).rejects.toMatchObject({
      code: 'REGISTRATION_VERIFICATION_CONTINUATION_INVALID',
      statusCode: 409,
    })
    expect(secretHasher).not.toHaveBeenCalled()
  })
})
