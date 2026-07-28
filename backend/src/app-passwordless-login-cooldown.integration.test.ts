import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from './app.js'
import type { DatabaseClient } from './db/client.js'
import type { EmailMessage } from './integrations/email/smtp.js'
import {
  createChatwootFetchWithContacts,
  createWrongCode,
  extractLatestCode,
  waitForMockCall,
} from './test/passwordlessLoginTestHelpers.js'
import { seedDefaultTenant, testEnv } from './test/appTestHelpers.js'
import { createTestDatabase } from './test/testDatabase.js'

const fixedNow = new Date('2026-04-21T12:00:00.000Z')

describe('passwordless code-login resend cooldown', () => {
  let app: ReturnType<typeof buildApp>
  let chatwootFetch: ReturnType<typeof createChatwootFetchWithContacts>
  let currentNow: Date
  let database: DatabaseClient
  let sendEmail: ReturnType<
    typeof vi.fn<(message: EmailMessage) => Promise<void>>
  >

  beforeEach(async () => {
    currentNow = fixedNow
    database = await createTestDatabase()
    await seedDefaultTenant(database)
    sendEmail = vi
      .fn<(message: EmailMessage) => Promise<void>>()
      .mockResolvedValue(undefined)
    chatwootFetch = createChatwootFetchWithContacts(() => [
      {
        email: 'Cooldown@Company.RU',
        id: 771,
        name: 'Cooldown Contact',
      },
    ])

    app = buildApp({
      chatwootFetchFn: chatwootFetch,
      database,
      emailDelivery: {
        send: sendEmail,
      },
      env: testEnv,
      now: () => currentNow,
    })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('keeps the resend cooldown after wrong attempts invalidate the current code', async () => {
    await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'cooldown@company.ru',
      },
      url: '/api/auth/code-login/request',
    })
    await waitForMockCall(sendEmail, 1)
    expect(chatwootFetch).toHaveBeenCalledTimes(1)
    const wrongCode = createWrongCode(extractLatestCode(sendEmail))

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        headers: {
          origin: testEnv.APP_ORIGIN,
        },
        method: 'POST',
        payload: {
          code: wrongCode,
          email: 'cooldown@company.ru',
        },
        url: '/api/auth/code-login/verify',
      })

      expect(response.statusCode).toBe(attempt < 4 ? 400 : 409)
    }

    const blockedResendResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'cooldown@company.ru',
      },
      url: '/api/auth/code-login/request',
    })
    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })

    expect(blockedResendResponse.statusCode).toBe(200)
    expect(blockedResendResponse.json()).toMatchObject({
      resendAvailableInSeconds: 60,
    })
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(chatwootFetch).toHaveBeenCalledTimes(1)

    currentNow = new Date(fixedNow.getTime() + 61_000)
    const allowedResendResponse = await app.inject({
      headers: {
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        email: 'cooldown@company.ru',
      },
      url: '/api/auth/code-login/request',
    })
    await waitForMockCall(sendEmail, 2)

    expect(allowedResendResponse.statusCode).toBe(200)
    expect(sendEmail).toHaveBeenCalledTimes(2)
    expect(chatwootFetch).toHaveBeenCalledTimes(2)
  })
})
