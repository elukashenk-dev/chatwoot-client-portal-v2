import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, desc, eq, inArray } from 'drizzle-orm'

import type { DatabaseClient } from '../../db/client.js'
import {
  portalLegalAcceptances,
  portalUserContactLinks,
  verificationRecords,
} from '../../db/schema.js'
import { ChatwootClientRequestError } from '../../integrations/chatwoot/client.js'
import {
  SmtpEmailDeliveryConfigurationError,
  SmtpEmailDeliveryError,
} from '../../integrations/email/smtp.js'
import { hashPassword } from '../../lib/password.js'
import { createPortalUsersRepository } from '../portal-users/repository.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import { seedTestTenant } from '../../test/testTenants.js'
import { registrationLegalDocumentVersions } from './legalDocuments.js'
import { createRegistrationRepository } from './repository.js'
import { createRegistrationService } from './service.js'

const acceptedRegistrationLegal = {
  personalDataConsentAccepted: true,
  requestIp: '203.0.113.10',
  termsAccepted: true,
  userAgent: 'Mozilla/5.0',
} as const

function extractVerificationCode(text: string) {
  const match = text.match(/\b\d{6}\b/)

  if (!match) {
    throw new Error('Expected a six-digit verification code in the email body.')
  }

  return match[0]
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return {
    promise,
    reject,
    resolve,
  }
}

async function waitForMockCall(mock: ReturnType<typeof vi.fn>) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (mock.mock.calls.length > 0) {
      return
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 10)
    })
  }

  throw new Error('Expected mock to be called.')
}

async function findPendingRegistrationRecords(
  database: DatabaseClient,
  tenantId: number,
) {
  return database.db
    .select({
      attemptsCount: verificationRecords.attemptsCount,
      email: verificationRecords.email,
      id: verificationRecords.id,
      purpose: verificationRecords.purpose,
      status: verificationRecords.status,
    })
    .from(verificationRecords)
    .where(
      and(
        eq(verificationRecords.tenantId, tenantId),
        eq(verificationRecords.email, 'name@company.ru'),
        eq(verificationRecords.purpose, 'registration'),
        eq(verificationRecords.status, 'pending'),
      ),
    )
}

async function findActiveRegistrationRecords(
  database: DatabaseClient,
  tenantId: number,
) {
  return database.db
    .select({
      email: verificationRecords.email,
      id: verificationRecords.id,
      purpose: verificationRecords.purpose,
      status: verificationRecords.status,
    })
    .from(verificationRecords)
    .where(
      and(
        eq(verificationRecords.tenantId, tenantId),
        eq(verificationRecords.email, 'name@company.ru'),
        eq(verificationRecords.purpose, 'registration'),
        inArray(verificationRecords.status, ['pending', 'sending']),
      ),
    )
}

async function findPortalUserContactLinks(
  database: DatabaseClient,
  tenantId: number,
) {
  return database.db
    .select({
      chatwootContactId: portalUserContactLinks.chatwootContactId,
      userId: portalUserContactLinks.userId,
    })
    .from(portalUserContactLinks)
    .where(eq(portalUserContactLinks.tenantId, tenantId))
}

async function findLegalAcceptanceRecords(
  database: DatabaseClient,
  tenantId: number,
  email = 'name@company.ru',
) {
  return database.db
    .select({
      email: portalLegalAcceptances.email,
      id: portalLegalAcceptances.id,
      personalDataConsentAccepted:
        portalLegalAcceptances.personalDataConsentAccepted,
      portalUserId: portalLegalAcceptances.portalUserId,
      privacyPolicyVersion: portalLegalAcceptances.privacyPolicyVersion,
      purpose: portalLegalAcceptances.purpose,
      requestIp: portalLegalAcceptances.requestIp,
      tenantId: portalLegalAcceptances.tenantId,
      termsAccepted: portalLegalAcceptances.termsAccepted,
      termsVersion: portalLegalAcceptances.termsVersion,
      userAgent: portalLegalAcceptances.userAgent,
    })
    .from(portalLegalAcceptances)
    .where(
      and(
        eq(portalLegalAcceptances.tenantId, tenantId),
        eq(portalLegalAcceptances.email, email),
      ),
    )
    .orderBy(desc(portalLegalAcceptances.id))
}

describe('registration service', () => {
  let database: DatabaseClient
  let tenantId: number

  function createRegistrationServiceForTest(
    options: Omit<Parameters<typeof createRegistrationService>[0], 'tenantId'>,
  ) {
    return createRegistrationService({
      ...options,
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
      message:
        'Мы не нашли профиль с таким email. Позвоните по тел: +7 (906) 12-955-12.',
      statusCode: 403,
    })
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

  it('rejects registration when the portal account already exists', async () => {
    const portalUsersRepository = createPortalUsersRepository(database.db)

    await portalUsersRepository.create({
      email: 'name@company.ru',
      fullName: 'Portal User',
      passwordHash: 'hashed-password',
      tenantId,
    })

    const service = createRegistrationServiceForTest({
      chatwootClient: {
        findContactByEmail: vi.fn().mockResolvedValue({
          email: 'name@company.ru',
          id: 17,
          name: 'Portal User',
        }),
      },
      emailDelivery: {
        send: vi.fn(),
      },
      now: () => new Date('2026-04-21T12:00:00.000Z'),
      portalUsersRepository,
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
      code: 'REGISTRATION_ACCOUNT_EXISTS',
      statusCode: 409,
    })
  })

  it('creates a pending verification record and sends a code email', async () => {
    const sendEmail = vi.fn().mockResolvedValue(undefined)
    const registrationRepository = createRegistrationRepository(database.db, {
      tenantId,
    })
    const service = createRegistrationServiceForTest({
      chatwootClient: {
        findContactByEmail: vi.fn().mockResolvedValue({
          email: 'Name@Company.RU',
          id: 44,
          name: 'Portal User',
        }),
      },
      emailDelivery: {
        send: sendEmail,
      },
      now: () => new Date('2026-04-21T12:00:00.000Z'),
      portalUsersRepository: createPortalUsersRepository(database.db),
      registrationRepository,
    })

    const result = await service.requestVerification({
      email: ' Name@Company.RU ',
      fullName: '  Portal User  ',
      legalAcceptance: acceptedRegistrationLegal,
    })

    expect(result).toEqual({
      delivery: 'sent',
      email: 'name@company.ru',
      expiresInSeconds: 900,
      nextStep: 'verify_code',
      purpose: 'registration',
      resendAvailableInSeconds: 60,
      result: 'verification_requested',
    })

    const record =
      await registrationRepository.findLatestPendingVerificationByEmail(
        'name@company.ru',
      )

    expect(record).toMatchObject({
      chatwootContactId: 44,
      email: 'name@company.ru',
      fullName: 'Portal User',
      resendCount: 0,
      status: 'pending',
    })
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Код подтверждения для Client Portal',
        text: expect.stringMatching(/\b\d{6}\b/),
        to: 'name@company.ru',
      }),
    )
    expect(await findLegalAcceptanceRecords(database, tenantId)).toEqual([
      expect.objectContaining({
        email: 'name@company.ru',
        personalDataConsentAccepted: true,
        portalUserId: null,
        privacyPolicyVersion:
          registrationLegalDocumentVersions.privacyPolicyVersion,
        purpose: 'registration',
        requestIp: '203.0.113.10',
        tenantId,
        termsAccepted: true,
        termsVersion: registrationLegalDocumentVersions.termsVersion,
        userAgent: 'Mozilla/5.0',
      }),
    ])
  })

  it('returns the active pending verification during cooldown without depending on Chatwoot', async () => {
    const sendEmail = vi.fn().mockResolvedValue(undefined)
    const portalUsersRepository = createPortalUsersRepository(database.db)
    const registrationRepository = createRegistrationRepository(database.db, {
      tenantId,
    })
    const findContactByEmail = vi
      .fn()
      .mockResolvedValueOnce({
        email: 'name@company.ru',
        id: 44,
        name: 'Portal User',
      })
      .mockRejectedValue(new ChatwootClientRequestError())
    let now = new Date('2026-04-21T12:00:00.000Z')
    const service = createRegistrationServiceForTest({
      chatwootClient: {
        findContactByEmail,
      },
      emailDelivery: {
        send: sendEmail,
      },
      now: () => now,
      portalUsersRepository,
      registrationRepository,
    })

    await service.requestVerification({
      email: 'name@company.ru',
      fullName: 'Portal User',
      legalAcceptance: acceptedRegistrationLegal,
    })

    now = new Date('2026-04-21T12:00:30.000Z')

    const result = await service.requestVerification({
      email: 'name@company.ru',
      fullName: 'Portal User',
      legalAcceptance: {
        ...acceptedRegistrationLegal,
        requestIp: '203.0.113.11',
        userAgent: 'Mozilla/5.1',
      },
    })

    expect(result).toEqual({
      delivery: 'existing_pending',
      email: 'name@company.ru',
      expiresInSeconds: 870,
      nextStep: 'verify_code',
      purpose: 'registration',
      resendAvailableInSeconds: 30,
      result: 'verification_requested',
    })
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(findContactByEmail).toHaveBeenCalledTimes(1)
    expect(await findLegalAcceptanceRecords(database, tenantId)).toEqual([
      expect.objectContaining({
        requestIp: '203.0.113.11',
        userAgent: 'Mozilla/5.1',
      }),
      expect.objectContaining({
        requestIp: '203.0.113.10',
        userAgent: 'Mozilla/5.0',
      }),
    ])
  })

  it('serializes parallel registration requests to one active pending code', async () => {
    const sendEmail = vi.fn().mockResolvedValue(undefined)
    const registrationRepository = createRegistrationRepository(database.db, {
      tenantId,
    })
    const service = createRegistrationServiceForTest({
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
      now: () => new Date('2026-04-21T12:00:00.000Z'),
      portalUsersRepository: createPortalUsersRepository(database.db),
      registrationRepository,
    })

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        service.requestVerification({
          email: 'name@company.ru',
          fullName: 'Portal User',
          legalAcceptance: acceptedRegistrationLegal,
        }),
      ),
    )

    expect(results).toHaveLength(5)
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true)
    expect(
      results.every(
        (result) =>
          result.status === 'fulfilled' ||
          result.reason.code === 'REGISTRATION_DELIVERY_IN_PROGRESS',
      ),
    ).toBe(true)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(
      await findPendingRegistrationRecords(database, tenantId),
    ).toHaveLength(1)
  })

  it('does not expose in-flight delivery as reusable pending when email send fails', async () => {
    const delivery = createDeferred<void>()
    const sendEmail = vi.fn(() => delivery.promise)
    const registrationRepository = createRegistrationRepository(database.db, {
      tenantId,
    })
    const service = createRegistrationServiceForTest({
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
      now: () => new Date('2026-04-21T12:00:00.000Z'),
      portalUsersRepository: createPortalUsersRepository(database.db),
      registrationRepository,
    })

    const firstRequest = service.requestVerification({
      email: 'name@company.ru',
      fullName: 'Portal User',
      legalAcceptance: acceptedRegistrationLegal,
    })

    await waitForMockCall(sendEmail)

    await expect(
      service.requestVerification({
        email: 'name@company.ru',
        fullName: 'Portal User',
        legalAcceptance: acceptedRegistrationLegal,
      }),
    ).rejects.toMatchObject({
      code: 'REGISTRATION_DELIVERY_IN_PROGRESS',
      statusCode: 409,
    })

    delivery.reject(new SmtpEmailDeliveryError())

    await expect(firstRequest).rejects.toMatchObject({
      code: 'REGISTRATION_DELIVERY_UNAVAILABLE',
      statusCode: 503,
    })
    expect(
      await findPendingRegistrationRecords(database, tenantId),
    ).toHaveLength(0)
  })

  it('cleans up the sending verification when SMTP delivery is misconfigured', async () => {
    const sendEmail = vi
      .fn()
      .mockRejectedValue(new SmtpEmailDeliveryConfigurationError())
    const registrationRepository = createRegistrationRepository(database.db, {
      tenantId,
    })
    const service = createRegistrationServiceForTest({
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
      now: () => new Date('2026-04-21T12:00:00.000Z'),
      portalUsersRepository: createPortalUsersRepository(database.db),
      registrationRepository,
    })

    await expect(
      service.requestVerification({
        email: 'name@company.ru',
        fullName: 'Portal User',
        legalAcceptance: acceptedRegistrationLegal,
      }),
    ).rejects.toMatchObject({
      code: 'REGISTRATION_UNAVAILABLE',
      statusCode: 503,
    })

    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(
      await findActiveRegistrationRecords(database, tenantId),
    ).toHaveLength(0)
  })

  it('confirms the verification code and returns a continuation token', async () => {
    const sendEmail = vi.fn().mockResolvedValue(undefined)
    const portalUsersRepository = createPortalUsersRepository(database.db)
    const registrationRepository = createRegistrationRepository(database.db, {
      tenantId,
    })
    const service = createRegistrationServiceForTest({
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
      now: () => new Date('2026-04-21T12:00:00.000Z'),
      portalUsersRepository,
      registrationRepository,
    })

    await service.requestVerification({
      email: 'name@company.ru',
      fullName: 'Portal User',
      legalAcceptance: acceptedRegistrationLegal,
    })

    const emailMessage = sendEmail.mock.calls[0]?.[0]
    const verificationCode = extractVerificationCode(emailMessage?.text ?? '')
    const result = await service.confirmVerification({
      code: verificationCode,
      email: 'name@company.ru',
    })

    expect(result).toEqual({
      continuationToken: expect.any(String),
      continuationExpiresInSeconds: 900,
      email: 'name@company.ru',
      nextStep: 'set_password',
      purpose: 'registration',
      result: 'verification_confirmed',
    })

    const record =
      await registrationRepository.findLatestVerificationByEmail(
        'name@company.ru',
      )

    expect(record).toMatchObject({
      continuationTokenExpiresAt: expect.any(Date),
      continuationTokenHash: expect.any(String),
      status: 'verified',
      verifiedAt: expect.any(Date),
    })
  })

  it('increments attempts and rejects an invalid verification code', async () => {
    const sendEmail = vi.fn().mockResolvedValue(undefined)
    const registrationRepository = createRegistrationRepository(database.db, {
      tenantId,
    })
    const service = createRegistrationServiceForTest({
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
      now: () => new Date('2026-04-21T12:00:00.000Z'),
      portalUsersRepository: createPortalUsersRepository(database.db),
      registrationRepository,
    })

    await service.requestVerification({
      email: 'name@company.ru',
      fullName: 'Portal User',
      legalAcceptance: acceptedRegistrationLegal,
    })

    await expect(
      service.confirmVerification({
        code: '999999',
        email: 'name@company.ru',
      }),
    ).rejects.toMatchObject({
      code: 'REGISTRATION_VERIFICATION_INVALID_CODE',
      statusCode: 400,
    })

    const record =
      await registrationRepository.findLatestPendingVerificationByEmail(
        'name@company.ru',
      )

    expect(record).toMatchObject({
      attemptsCount: 1,
      status: 'pending',
    })
  })

  it('invalidates the verification after too many incorrect attempts', async () => {
    const sendEmail = vi.fn().mockResolvedValue(undefined)
    const registrationRepository = createRegistrationRepository(database.db, {
      tenantId,
    })
    const service = createRegistrationServiceForTest({
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
      now: () => new Date('2026-04-21T12:00:00.000Z'),
      portalUsersRepository: createPortalUsersRepository(database.db),
      registrationRepository,
    })

    await service.requestVerification({
      email: 'name@company.ru',
      fullName: 'Portal User',
      legalAcceptance: acceptedRegistrationLegal,
    })

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await expect(
        service.confirmVerification({
          code: '999999',
          email: 'name@company.ru',
        }),
      ).rejects.toMatchObject({
        code:
          attempt === 5
            ? 'REGISTRATION_VERIFICATION_TOO_MANY_ATTEMPTS'
            : 'REGISTRATION_VERIFICATION_INVALID_CODE',
      })
    }

    const latestRecord =
      await registrationRepository.findLatestVerificationByEmail(
        'name@company.ru',
      )

    expect(latestRecord).toMatchObject({
      attemptsCount: 5,
      status: 'invalidated',
    })
  })

  it('does not lose invalid attempts under parallel verification requests', async () => {
    const sendEmail = vi.fn().mockResolvedValue(undefined)
    const registrationRepository = createRegistrationRepository(database.db, {
      tenantId,
    })
    const service = createRegistrationServiceForTest({
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
      now: () => new Date('2026-04-21T12:00:00.000Z'),
      portalUsersRepository: createPortalUsersRepository(database.db),
      registrationRepository,
    })

    await service.requestVerification({
      email: 'name@company.ru',
      fullName: 'Portal User',
      legalAcceptance: acceptedRegistrationLegal,
    })

    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        service.confirmVerification({
          code: '999999',
          email: 'name@company.ru',
        }),
      ),
    )

    const errorCodes = attempts.map((attempt) =>
      attempt.status === 'rejected' ? attempt.reason.code : null,
    )

    expect(errorCodes).toEqual(
      expect.arrayContaining([
        'REGISTRATION_VERIFICATION_INVALID_CODE',
        'REGISTRATION_VERIFICATION_TOO_MANY_ATTEMPTS',
      ]),
    )

    const latestRecord =
      await registrationRepository.findLatestVerificationByEmail(
        'name@company.ru',
      )

    expect(latestRecord).toMatchObject({
      attemptsCount: 5,
      status: 'invalidated',
    })
  })

  it('completes registration after verification and creates a portal user', async () => {
    const sendEmail = vi.fn().mockResolvedValue(undefined)
    const portalUsersRepository = createPortalUsersRepository(database.db)
    const registrationRepository = createRegistrationRepository(database.db, {
      tenantId,
    })
    const service = createRegistrationServiceForTest({
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
      now: () => new Date('2026-04-21T12:00:00.000Z'),
      portalUsersRepository,
      registrationRepository,
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
      email: 'name@company.ru',
      nextStep: 'login',
      purpose: 'registration',
      result: 'registration_completed',
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
    expect(await findPortalUserContactLinks(database, tenantId)).toEqual([
      {
        chatwootContactId: 44,
        userId: createdUser?.id,
      },
    ])
    expect(await findLegalAcceptanceRecords(database, tenantId)).toEqual([
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

  it('rejects registration set-password when password misses a letter or number', async () => {
    const service = createRegistrationServiceForTest({
      chatwootClient: {
        findContactByEmail: vi.fn(),
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
      service.setPassword({
        continuationToken: 'continuation-token',
        email: 'name@company.ru',
        newPassword: '12345678',
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      statusCode: 400,
    })

    await expect(
      service.setPassword({
        continuationToken: 'continuation-token',
        email: 'name@company.ru',
        newPassword: 'Password',
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      statusCode: 400,
    })
  })

  it('rejects set-password when the portal account already exists', async () => {
    const sendEmail = vi.fn().mockResolvedValue(undefined)
    const portalUsersRepository = createPortalUsersRepository(database.db)
    const registrationRepository = createRegistrationRepository(database.db, {
      tenantId,
    })
    const service = createRegistrationServiceForTest({
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
      now: () => new Date('2026-04-21T12:00:00.000Z'),
      portalUsersRepository,
      registrationRepository,
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

    await portalUsersRepository.create({
      email: 'name@company.ru',
      fullName: 'Portal User',
      passwordHash: 'hashed-password',
      tenantId,
    })

    await expect(
      service.setPassword({
        continuationToken: verification.continuationToken,
        email: 'name@company.ru',
        newPassword: 'PortalPass123',
      }),
    ).rejects.toMatchObject({
      code: 'REGISTRATION_ACCOUNT_EXISTS',
      statusCode: 409,
    })

    const latestRecord =
      await registrationRepository.findLatestVerificationByEmail(
        'name@company.ru',
      )

    expect(latestRecord).toMatchObject({
      continuationTokenHash: null,
      status: 'invalidated',
    })
  })

  it('keeps same-email verification codes and continuation tokens isolated by tenant', async () => {
    const tenantB = await seedTestTenant(database.db, {
      primaryDomain: 'tenant-b.localhost',
      slug: 'tenant-b',
    })
    const portalUsersRepository = createPortalUsersRepository(database.db)
    const now = new Date('2026-04-21T12:00:00.000Z')
    const serviceA = createRegistrationService({
      chatwootClient: {
        findContactByEmail: vi.fn(),
      },
      emailDelivery: {
        send: vi.fn(),
      },
      now: () => now,
      portalUsersRepository,
      registrationRepository: createRegistrationRepository(database.db, {
        tenantId,
      }),
      tenantId,
    })
    const serviceB = createRegistrationService({
      chatwootClient: {
        findContactByEmail: vi.fn(),
      },
      emailDelivery: {
        send: vi.fn(),
      },
      now: () => now,
      portalUsersRepository,
      registrationRepository: createRegistrationRepository(database.db, {
        tenantId: tenantB.id,
      }),
      tenantId: tenantB.id,
    })

    await database.db.insert(verificationRecords).values([
      {
        attemptsCount: 0,
        chatwootContactId: 44,
        codeHash: await hashPassword('111111'),
        email: 'name@company.ru',
        expiresAt: new Date('2026-04-21T12:15:00.000Z'),
        fullName: 'Tenant A User',
        lastSentAt: now,
        maxAttempts: 5,
        purpose: 'registration',
        resendCount: 0,
        resendNotBefore: new Date('2026-04-21T12:01:00.000Z'),
        status: 'pending',
        tenantId,
      },
      {
        attemptsCount: 0,
        chatwootContactId: 44,
        codeHash: await hashPassword('222222'),
        email: 'name@company.ru',
        expiresAt: new Date('2026-04-21T12:15:00.000Z'),
        fullName: 'Tenant B User',
        lastSentAt: now,
        maxAttempts: 5,
        purpose: 'registration',
        resendCount: 0,
        resendNotBefore: new Date('2026-04-21T12:01:00.000Z'),
        status: 'pending',
        tenantId: tenantB.id,
      },
    ])

    await expect(
      serviceB.confirmVerification({
        code: '111111',
        email: 'name@company.ru',
      }),
    ).rejects.toMatchObject({
      code: 'REGISTRATION_VERIFICATION_INVALID_CODE',
      statusCode: 400,
    })

    const verificationA = await serviceA.confirmVerification({
      code: '111111',
      email: 'name@company.ru',
    })
    const verificationB = await serviceB.confirmVerification({
      code: '222222',
      email: 'name@company.ru',
    })

    await expect(
      serviceB.setPassword({
        continuationToken: verificationA.continuationToken,
        email: 'name@company.ru',
        newPassword: 'TenantB123',
      }),
    ).rejects.toMatchObject({
      code: 'REGISTRATION_VERIFICATION_CONTINUATION_INVALID',
      statusCode: 409,
    })

    await expect(
      serviceA.setPassword({
        continuationToken: verificationA.continuationToken,
        email: 'name@company.ru',
        newPassword: 'TenantA123',
      }),
    ).resolves.toMatchObject({
      result: 'registration_completed',
    })
    await expect(
      serviceB.setPassword({
        continuationToken: verificationB.continuationToken,
        email: 'name@company.ru',
        newPassword: 'TenantB123',
      }),
    ).resolves.toMatchObject({
      result: 'registration_completed',
    })
    await expect(
      portalUsersRepository.findByEmail({
        email: 'name@company.ru',
        tenantId,
      }),
    ).resolves.toMatchObject({
      fullName: 'Tenant A User',
    })
    await expect(
      portalUsersRepository.findByEmail({
        email: 'name@company.ru',
        tenantId: tenantB.id,
      }),
    ).resolves.toMatchObject({
      fullName: 'Tenant B User',
    })
  })
})
