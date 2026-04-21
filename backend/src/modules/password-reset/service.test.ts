import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DatabaseClient } from '../../db/client.js'
import {
  SmtpEmailDeliveryConfigurationError,
  SmtpEmailDeliveryError,
} from '../../integrations/email/smtp.js'
import { hashPassword, verifyPassword } from '../../lib/password.js'
import { createPortalUsersRepository } from '../portal-users/repository.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import { createPasswordResetRepository } from './repository.js'
import { createPasswordResetService } from './service.js'

function extractResetCode(text: string) {
  const match = text.match(/\b\d{6}\b/)

  if (!match) {
    throw new Error(
      'Expected a six-digit password reset code in the email body.',
    )
  }

  return match[0]
}

async function waitForBackgroundDelivery() {
  await new Promise<void>((resolve) => {
    setImmediate(resolve)
  })
  await Promise.resolve()
}

async function waitForExpectation(assertion: () => Promise<void> | void) {
  let lastError: unknown

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await assertion()
      return
    } catch (error) {
      lastError = error
      await waitForBackgroundDelivery()
    }
  }

  throw lastError
}

describe('password reset service', () => {
  let database: DatabaseClient

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.close()
  })

  it('creates a reset record and sends a code email for an active portal user', async () => {
    const sendEmail = vi.fn().mockResolvedValue(undefined)
    const portalUsersRepository = createPortalUsersRepository(database.db)
    const passwordResetRepository = createPasswordResetRepository(database.db)

    await portalUsersRepository.create({
      email: 'Name@Company.RU',
      fullName: 'Portal User',
      passwordHash: await hashPassword('OldPass123'),
    })

    const service = createPasswordResetService({
      emailDelivery: {
        send: sendEmail,
      },
      now: () => new Date('2026-04-21T12:00:00.000Z'),
      passwordResetRepository,
    })

    const result = await service.requestPasswordReset({
      email: ' Name@Company.RU ',
    })
    await waitForBackgroundDelivery()

    expect(result).toEqual({
      accepted: true,
      email: 'name@company.ru',
      expiresInSeconds: 900,
      nextStep: 'verify_code',
      purpose: 'password_reset',
      resendAvailableInSeconds: 60,
      result: 'password_reset_requested',
    })

    const record =
      await passwordResetRepository.findLatestResetByEmail('name@company.ru')

    expect(record).toMatchObject({
      email: 'name@company.ru',
      portalUserId: 1,
      status: 'pending',
    })
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Код восстановления пароля для Client Portal',
        text: expect.stringMatching(/\b\d{6}\b/),
        to: 'name@company.ru',
      }),
    )
  })

  it('keeps request response generic for a missing account and does not send email', async () => {
    const sendEmail = vi.fn().mockResolvedValue(undefined)
    const passwordResetRepository = createPasswordResetRepository(database.db)
    const service = createPasswordResetService({
      emailDelivery: {
        send: sendEmail,
      },
      now: () => new Date('2026-04-21T12:00:00.000Z'),
      passwordResetRepository,
    })

    const result = await service.requestPasswordReset({
      email: 'missing@company.ru',
    })

    expect(result).toMatchObject({
      accepted: true,
      email: 'missing@company.ru',
      nextStep: 'verify_code',
      purpose: 'password_reset',
      result: 'password_reset_requested',
    })

    const record =
      await passwordResetRepository.findLatestResetByEmail('missing@company.ru')

    expect(record).toMatchObject({
      email: 'missing@company.ru',
      portalUserId: null,
      status: 'pending',
    })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('confirms the reset code and returns a continuation token', async () => {
    const sendEmail = vi.fn().mockResolvedValue(undefined)
    const portalUsersRepository = createPortalUsersRepository(database.db)
    const passwordResetRepository = createPasswordResetRepository(database.db)

    await portalUsersRepository.create({
      email: 'name@company.ru',
      fullName: 'Portal User',
      passwordHash: await hashPassword('OldPass123'),
    })

    const service = createPasswordResetService({
      emailDelivery: {
        send: sendEmail,
      },
      now: () => new Date('2026-04-21T12:00:00.000Z'),
      passwordResetRepository,
    })

    await service.requestPasswordReset({
      email: 'name@company.ru',
    })
    await waitForBackgroundDelivery()

    const emailMessage = sendEmail.mock.calls[0]?.[0]
    const resetCode = extractResetCode(emailMessage?.text ?? '')
    const result = await service.confirmPasswordReset({
      code: resetCode,
      email: 'name@company.ru',
    })

    expect(result).toEqual({
      continuationToken: expect.any(String),
      continuationExpiresInSeconds: 900,
      email: 'name@company.ru',
      nextStep: 'set_password',
      purpose: 'password_reset',
      result: 'password_reset_verified',
    })

    const record =
      await passwordResetRepository.findLatestResetByEmail('name@company.ru')

    expect(record).toMatchObject({
      continuationTokenExpiresAt: expect.any(Date),
      continuationTokenHash: expect.any(String),
      status: 'verified',
      verifiedAt: expect.any(Date),
    })
  })

  it('increments attempts and invalidates after too many incorrect codes', async () => {
    const sendEmail = vi.fn().mockResolvedValue(undefined)
    const portalUsersRepository = createPortalUsersRepository(database.db)
    const passwordResetRepository = createPasswordResetRepository(database.db)

    await portalUsersRepository.create({
      email: 'name@company.ru',
      fullName: 'Portal User',
      passwordHash: await hashPassword('OldPass123'),
    })

    const service = createPasswordResetService({
      emailDelivery: {
        send: sendEmail,
      },
      now: () => new Date('2026-04-21T12:00:00.000Z'),
      passwordResetRepository,
    })

    await service.requestPasswordReset({
      email: 'name@company.ru',
    })
    await waitForBackgroundDelivery()

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await expect(
        service.confirmPasswordReset({
          code: '999999',
          email: 'name@company.ru',
        }),
      ).rejects.toMatchObject({
        code:
          attempt === 5
            ? 'PASSWORD_RESET_TOO_MANY_ATTEMPTS'
            : 'PASSWORD_RESET_INVALID_CODE',
      })
    }

    const latestRecord =
      await passwordResetRepository.findLatestResetByEmail('name@company.ru')

    expect(latestRecord).toMatchObject({
      attemptsCount: 5,
      status: 'invalidated',
    })
  })

  it('does not lose invalid attempts under parallel reset verification requests', async () => {
    const sendEmail = vi.fn().mockResolvedValue(undefined)
    const portalUsersRepository = createPortalUsersRepository(database.db)
    const passwordResetRepository = createPasswordResetRepository(database.db)

    await portalUsersRepository.create({
      email: 'name@company.ru',
      fullName: 'Portal User',
      passwordHash: await hashPassword('OldPass123'),
    })

    const service = createPasswordResetService({
      emailDelivery: {
        send: sendEmail,
      },
      now: () => new Date('2026-04-21T12:00:00.000Z'),
      passwordResetRepository,
    })

    await service.requestPasswordReset({
      email: 'name@company.ru',
    })
    await waitForBackgroundDelivery()

    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        service.confirmPasswordReset({
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
        'PASSWORD_RESET_INVALID_CODE',
        'PASSWORD_RESET_TOO_MANY_ATTEMPTS',
      ]),
    )

    const latestRecord =
      await passwordResetRepository.findLatestResetByEmail('name@company.ru')

    expect(latestRecord).toMatchObject({
      attemptsCount: 5,
      status: 'invalidated',
    })
  })

  it('sets a new password after verification and consumes the reset proof', async () => {
    const sendEmail = vi.fn().mockResolvedValue(undefined)
    const portalUsersRepository = createPortalUsersRepository(database.db)
    const passwordResetRepository = createPasswordResetRepository(database.db)

    await portalUsersRepository.create({
      email: 'name@company.ru',
      fullName: 'Portal User',
      passwordHash: await hashPassword('OldPass123'),
    })

    const service = createPasswordResetService({
      emailDelivery: {
        send: sendEmail,
      },
      now: () => new Date('2026-04-21T12:00:00.000Z'),
      passwordResetRepository,
    })

    await service.requestPasswordReset({
      email: 'name@company.ru',
    })
    await waitForBackgroundDelivery()

    const emailMessage = sendEmail.mock.calls[0]?.[0]
    const resetCode = extractResetCode(emailMessage?.text ?? '')
    const verification = await service.confirmPasswordReset({
      code: resetCode,
      email: 'name@company.ru',
    })

    const result = await service.setPassword({
      continuationToken: verification.continuationToken,
      email: 'name@company.ru',
      newPassword: 'NewPass123',
    })

    expect(result).toEqual({
      email: 'name@company.ru',
      nextStep: 'login',
      purpose: 'password_reset',
      result: 'password_reset_completed',
    })

    const user = await portalUsersRepository.findByEmail('name@company.ru')

    expect(user).not.toBeNull()
    expect(await verifyPassword('OldPass123', user?.passwordHash ?? '')).toBe(
      false,
    )
    expect(await verifyPassword('NewPass123', user?.passwordHash ?? '')).toBe(
      true,
    )

    const latestRecord =
      await passwordResetRepository.findLatestResetByEmail('name@company.ru')

    expect(latestRecord).toMatchObject({
      continuationTokenHash: null,
      status: 'consumed',
    })
  })

  it('does not await SMTP delivery before returning a generic request response', async () => {
    let resolveDelivery!: () => void
    const sendEmail = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDelivery = resolve
        }),
    )
    const portalUsersRepository = createPortalUsersRepository(database.db)
    const passwordResetRepository = createPasswordResetRepository(database.db)

    await portalUsersRepository.create({
      email: 'name@company.ru',
      fullName: 'Portal User',
      passwordHash: await hashPassword('OldPass123'),
    })

    const service = createPasswordResetService({
      emailDelivery: {
        send: sendEmail,
      },
      now: () => new Date('2026-04-21T12:00:00.000Z'),
      passwordResetRepository,
    })

    const result = await service.requestPasswordReset({
      email: 'name@company.ru',
    })

    expect(result).toMatchObject({
      accepted: true,
      nextStep: 'verify_code',
      purpose: 'password_reset',
      result: 'password_reset_requested',
    })

    await waitForBackgroundDelivery()
    expect(sendEmail).toHaveBeenCalledTimes(1)

    resolveDelivery()
    await waitForBackgroundDelivery()
  })

  it('removes a newly-created pending reset when SMTP delivery fails', async () => {
    const sendEmail = vi
      .fn()
      .mockRejectedValueOnce(new SmtpEmailDeliveryConfigurationError())
      .mockResolvedValueOnce(undefined)
    const portalUsersRepository = createPortalUsersRepository(database.db)
    const passwordResetRepository = createPasswordResetRepository(database.db)

    await portalUsersRepository.create({
      email: 'name@company.ru',
      fullName: 'Portal User',
      passwordHash: await hashPassword('OldPass123'),
    })

    const service = createPasswordResetService({
      emailDelivery: {
        send: sendEmail,
      },
      now: () => new Date('2026-04-21T12:00:00.000Z'),
      passwordResetRepository,
    })

    await service.requestPasswordReset({
      email: 'name@company.ru',
    })

    await waitForExpectation(async () => {
      expect(
        await passwordResetRepository.findLatestResetByEmail('name@company.ru'),
      ).toBeNull()
    })

    await service.requestPasswordReset({
      email: 'name@company.ru',
    })

    await waitForExpectation(() => {
      expect(sendEmail).toHaveBeenCalledTimes(2)
    })

    const latestRecord =
      await passwordResetRepository.findLatestResetByEmail('name@company.ru')

    expect(latestRecord).toMatchObject({
      portalUserId: 1,
      status: 'pending',
    })
  })

  it('restores the previous pending reset when resend SMTP delivery fails', async () => {
    let currentTime = new Date('2026-04-21T12:00:00.000Z')
    const sendEmail = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new SmtpEmailDeliveryError())
    const portalUsersRepository = createPortalUsersRepository(database.db)
    const passwordResetRepository = createPasswordResetRepository(database.db)

    await portalUsersRepository.create({
      email: 'name@company.ru',
      fullName: 'Portal User',
      passwordHash: await hashPassword('OldPass123'),
    })

    const service = createPasswordResetService({
      emailDelivery: {
        send: sendEmail,
      },
      now: () => currentTime,
      passwordResetRepository,
    })

    await service.requestPasswordReset({
      email: 'name@company.ru',
    })
    await waitForBackgroundDelivery()

    const previousRecord =
      await passwordResetRepository.findLatestResetByEmail('name@company.ru')

    currentTime = new Date('2026-04-21T12:02:00.000Z')

    await service.requestPasswordReset({
      email: 'name@company.ru',
    })

    await waitForExpectation(async () => {
      const restoredRecord =
        await passwordResetRepository.findLatestResetByEmail('name@company.ru')

      expect(restoredRecord).toMatchObject({
        attemptsCount: previousRecord?.attemptsCount,
        codeHash: previousRecord?.codeHash,
        id: previousRecord?.id,
        lastSentAt: previousRecord?.lastSentAt,
        portalUserId: previousRecord?.portalUserId,
        resendCount: previousRecord?.resendCount,
        resendNotBefore: previousRecord?.resendNotBefore,
        status: 'pending',
      })
    })
  })
})
