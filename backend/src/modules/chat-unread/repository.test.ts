import { createWebhookSourceKey } from '../chatwoot-webhooks/sourceKey.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { DatabaseClient } from '../../db/client.js'
import { portalChatThreads, portalUsers } from '../../db/schema.js'
import { seedDefaultTenant } from '../../test/appTestHelpers.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import { createChatUnreadRepository } from './repository.js'

async function seedUserAndThreads() {
  const database = await createTestDatabase()
  const tenantId = await seedDefaultTenant(database)
  const [user] = await database.db
    .insert(portalUsers)
    .values({
      email: 'user@example.test',
      passwordHash: 'hash',
      tenantId,
    })
    .returning({ id: portalUsers.id })
  const [privateThread] = await database.db
    .insert(portalChatThreads)
    .values({
      chatwootContactId: 44,
      chatwootInboxId: 9,
      portalUserId: user!.id,
      tenantId,
      threadType: 'private',
    })
    .returning({ id: portalChatThreads.id })
  const [groupThread] = await database.db
    .insert(portalChatThreads)
    .values({
      chatwootContactId: 154,
      chatwootInboxId: 9,
      portalUserId: null,
      tenantId,
      threadType: 'group',
    })
    .returning({ id: portalChatThreads.id })

  return {
    database,
    groupThreadId: groupThread!.id,
    privateThreadId: privateThread!.id,
    tenantId,
    userId: user!.id,
  }
}

describe('createChatUnreadRepository', () => {
  let seeded: Awaited<ReturnType<typeof seedUserAndThreads>>
  let database: DatabaseClient

  beforeEach(async () => {
    seeded = await seedUserAndThreads()
    database = seeded.database
  })

  afterEach(async () => {
    await database.close()
  })

  it('deduplicates unread rows by user/thread/message and counts per thread', async () => {
    const repository = createChatUnreadRepository(seeded.database.db, {
      tenantId: seeded.tenantId,
      sourceKey: createWebhookSourceKey({
        baseUrl: 'https://chatwoot.example.test',
        accountId: 1,
        inboxId: 1,
      }),
    })

    await repository.insertUnreadMessages([
      {
        chatwootMessageId: 501,
        now: new Date('2026-06-01T09:00:00.000Z'),
        portalChatThreadId: seeded.privateThreadId,
        portalUserId: seeded.userId,
        threadId: 'private:me',
      },
      {
        chatwootMessageId: 501,
        now: new Date('2026-06-01T09:00:00.000Z'),
        portalChatThreadId: seeded.privateThreadId,
        portalUserId: seeded.userId,
        threadId: 'private:me',
      },
      {
        chatwootMessageId: 601,
        now: new Date('2026-06-01T09:01:00.000Z'),
        portalChatThreadId: seeded.groupThreadId,
        portalUserId: seeded.userId,
        threadId: 'group:154',
      },
    ])

    await expect(
      repository.countUnreadByThread({
        portalUserId: seeded.userId,
        threadIds: ['private:me', 'group:154', 'group:155'],
      }),
    ).resolves.toEqual(
      new Map([
        ['private:me', 1],
        ['group:154', 1],
        ['group:155', 0],
      ]),
    )
  })

  it('clears the opened thread and returns visible total without counting hidden threads', async () => {
    const repository = createChatUnreadRepository(seeded.database.db, {
      tenantId: seeded.tenantId,
      sourceKey: createWebhookSourceKey({
        baseUrl: 'https://chatwoot.example.test',
        accountId: 1,
        inboxId: 1,
      }),
    })

    await repository.insertUnreadMessages([
      {
        chatwootMessageId: 501,
        now: new Date('2026-06-01T09:00:00.000Z'),
        portalChatThreadId: seeded.privateThreadId,
        portalUserId: seeded.userId,
        threadId: 'private:me',
      },
      {
        chatwootMessageId: 601,
        now: new Date('2026-06-01T09:01:00.000Z'),
        portalChatThreadId: seeded.groupThreadId,
        portalUserId: seeded.userId,
        threadId: 'group:154',
      },
      {
        chatwootMessageId: 701,
        now: new Date('2026-06-01T09:02:00.000Z'),
        portalChatThreadId: seeded.groupThreadId,
        portalUserId: seeded.userId,
        threadId: 'group:203',
      },
    ])

    await expect(
      repository.clearThreadUnreadAndCountVisible({
        portalUserId: seeded.userId,
        threadId: 'group:154',
        throughMessageId: 10000,
        visibleThreadIds: ['private:me', 'group:154'],
      }),
    ).resolves.toEqual({
      totalUnreadCount: 1,
    })

    await expect(
      repository.countUnreadByThread({
        portalUserId: seeded.userId,
        threadIds: ['private:me', 'group:154', 'group:203'],
      }),
    ).resolves.toEqual(
      new Map([
        ['private:me', 1],
        ['group:154', 0],
        ['group:203', 1],
      ]),
    )
  })
  it('clears only messages included in the displayed snapshot and never moves the read cursor backward', async () => {
    const repository = createChatUnreadRepository(seeded.database.db, {
      tenantId: seeded.tenantId,
      sourceKey: createWebhookSourceKey({
        baseUrl: 'https://chatwoot.example.test',
        accountId: 1,
        inboxId: 1,
      }),
    })
    await repository.insertUnreadMessages(
      [501, 502].map((chatwootMessageId) => ({
        chatwootMessageId,
        now: new Date(),
        portalChatThreadId: seeded.privateThreadId,
        portalUserId: seeded.userId,
        threadId: 'private:me',
      })),
    )
    const clear = {
      portalUserId: seeded.userId,
      threadId: 'private:me',
      visibleThreadIds: ['private:me'],
    }
    expect(
      await repository.clearThreadUnreadAndCountVisible({
        ...clear,
        throughMessageId: 501,
      }),
    ).toEqual({ totalUnreadCount: 1 })
    expect(
      await repository.clearThreadUnreadAndCountVisible({
        ...clear,
        throughMessageId: 400,
      }),
    ).toEqual({ totalUnreadCount: 1 })
  })
})
