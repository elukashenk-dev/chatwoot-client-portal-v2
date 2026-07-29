import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { DatabaseClient } from '../../db/client.js'
import { seedDefaultTenant } from '../../test/appTestHelpers.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import {
  CHAT_ATTACHMENT_SEND_RATE_LIMIT,
  CHAT_TEXT_SEND_RATE_LIMIT,
  createChatSendRateLimitRepository,
  createChatSendRateLimiter,
} from './rateLimit.js'

describe('createChatSendRateLimiter', () => {
  let database: DatabaseClient
  let tenantId: number
  let now: Date

  beforeEach(async () => {
    database = await createTestDatabase()
    tenantId = await seedDefaultTenant(database)
    now = new Date('2026-05-15T08:00:00.000Z')
  })

  afterEach(async () => {
    await database.close()
  })

  function createLimiter() {
    return createChatSendRateLimiter({
      now: () => now,
      repository: createChatSendRateLimitRepository(database.db),
    })
  }

  it('limits text sends per tenant, user and thread, then resets after the window', async () => {
    const limiter = createLimiter()

    for (
      let index = 0;
      index < CHAT_TEXT_SEND_RATE_LIMIT.maxRequests;
      index += 1
    ) {
      await expect(
        limiter.consume({
          kind: 'text',
          tenantId,
          threadId: 'private:me',
          userId: 7,
        }),
      ).resolves.toEqual({
        status: 'allowed',
      })
    }

    await expect(
      limiter.consume({
        kind: 'text',
        tenantId,
        threadId: 'private:me',
        userId: 7,
      }),
    ).resolves.toEqual({
      retryAfterSeconds: 60,
      status: 'limited',
    })

    await expect(
      limiter.consume({
        kind: 'text',
        tenantId,
        threadId: 'private:me',
        userId: 8,
      }),
    ).resolves.toEqual({
      status: 'allowed',
    })

    await expect(
      limiter.consume({
        kind: 'text',
        tenantId,
        threadId: 'group:154',
        userId: 7,
      }),
    ).resolves.toEqual({
      status: 'allowed',
    })

    now = new Date(now.getTime() + CHAT_TEXT_SEND_RATE_LIMIT.windowMs)

    await expect(
      limiter.consume({
        kind: 'text',
        tenantId,
        threadId: 'private:me',
        userId: 7,
      }),
    ).resolves.toEqual({
      status: 'allowed',
    })
  })

  it('uses a user-wide attachment upload budget across chats', async () => {
    const limiter = createLimiter()

    expect(CHAT_ATTACHMENT_SEND_RATE_LIMIT.maxRequests).toBeLessThan(
      CHAT_TEXT_SEND_RATE_LIMIT.maxRequests,
    )

    const concurrentAttempts = await Promise.all(
      Array.from(
        { length: CHAT_ATTACHMENT_SEND_RATE_LIMIT.maxRequests + 1 },
        () =>
          limiter.consumeAttachmentUpload({
            tenantId,
            userId: 7,
          }),
      ),
    )

    expect(
      concurrentAttempts.filter(({ status }) => status === 'allowed'),
    ).toHaveLength(CHAT_ATTACHMENT_SEND_RATE_LIMIT.maxRequests)
    expect(
      concurrentAttempts.filter(({ status }) => status === 'limited'),
    ).toEqual([
      {
        retryAfterSeconds: 60,
        status: 'limited',
      },
    ])

    await expect(
      limiter.consumeAttachmentUpload({
        tenantId,
        userId: 8,
      }),
    ).resolves.toEqual({
      status: 'allowed',
    })

    await expect(
      limiter.consume({
        kind: 'text',
        tenantId,
        threadId: 'private:me',
        userId: 7,
      }),
    ).resolves.toEqual({
      status: 'allowed',
    })
  })
})
