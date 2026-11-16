import { createWebhookSourceKey } from '../chatwoot-webhooks/sourceKey.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { DatabaseClient } from '../../db/client.js'
import {
  chatwootWebhookDeliveries,
  portalChatThreads,
  portalChatUnreadMessages,
  portalUsers,
  portalWebhookWork,
} from '../../db/schema.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import { seedTestTenant } from '../../test/testTenants.js'
import { createChatUnreadRepository } from '../chat-unread/repository.js'
import { createChatwootWebhookRepository } from './repository.js'
import { createWebhookWorkRepository } from './workRepository.js'

describe('durable webhook acceptance and recovery', () => {
  let database: DatabaseClient
  let tenantId: number
  let userId: number
  let threadId: number
  let current: Date
  let deliveries: ReturnType<typeof createChatwootWebhookRepository>
  let queue: ReturnType<typeof createWebhookWorkRepository>
  beforeEach(async () => {
    database = await createTestDatabase()
    tenantId = (await seedTestTenant(database.db)).id
    const [user] = await database.db
      .insert(portalUsers)
      .values({ tenantId, email: 'queue@example.test' })
      .returning()
    userId = user!.id
    const [thread] = await database.db
      .insert(portalChatThreads)
      .values({
        tenantId,
        portalUserId: userId,
        chatwootContactId: 42,
        chatwootConversationId: 101,
        chatwootInboxId: 1,
        threadType: 'private',
      })
      .returning()
    threadId = thread!.id
    current = new Date(Date.now() + 1000)
    deliveries = createChatwootWebhookRepository(database.db, { tenantId })
    queue = createWebhookWorkRepository(database.db, () => current)
  })
  afterEach(async () => {
    await database.close()
  })
  const recipients = () => [
    {
      portalChatThreadId: threadId,
      portalUserId: userId,
      threadId: 'private:me',
      threadTitle: 'Chat',
      threadType: 'private' as const,
    },
  ]
  const accept = (key = 'one', eventName = 'message_created', message = 501) =>
    deliveries.recordDelivery({
      deliveryKey: key,
      eventName,
      chatwootConversationId: 101,
      chatwootMessageId: message,
      payloadSha256: 'hash',
      status: 'accepted',
      source: {
        accountId: 1,
        inboxId: 1,
        baseUrl: 'https://chatwoot.example.test',
      },
      now: current,
    })

  it('atomically persists acceptance and work, with delivery and semantic created dedupe', async () => {
    expect(await accept()).toBe('recorded')
    expect(await accept()).toBe('duplicate')
    expect(await accept('new-delivery-key')).toBe('recorded')
    expect(await database.db.select().from(portalWebhookWork)).toHaveLength(1)
    const job = await queue.claim()
    expect(job).not.toBeNull()
    await queue.checkpointUnread(job!, recipients())
    await queue.complete(job!)
    await createChatUnreadRepository(database.db, {
      tenantId,
      sourceKey: createWebhookSourceKey({
        baseUrl: 'https://chatwoot.example.test',
        accountId: 1,
        inboxId: 1,
      }),
    }).clearThreadUnreadAndCountVisible({
      portalUserId: userId,
      threadId: 'private:me',
      throughMessageId: 10000,
      visibleThreadIds: [],
    })
    await accept('third-delivery-key')
    expect(await queue.claim()).toBeNull()
    expect(
      await database.db.select().from(portalChatUnreadMessages),
    ).toHaveLength(0)
  })
  it('rolls back acceptance when work cannot be persisted', async () => {
    await database.db
      .delete(portalChatThreads)
      .where(eq(portalChatThreads.id, threadId))
    await expect(accept()).rejects.toThrow()
    expect(
      await database.db.select().from(chatwootWebhookDeliveries),
    ).toHaveLength(0)
    expect(await database.db.select().from(portalWebhookWork)).toHaveLength(0)
  })
  it('coalesces updates but re-arms when an update arrives during processing', async () => {
    await accept('one', 'message_updated')
    await accept('two', 'message_updated')
    const job = (await queue.claim())!
    expect(job.generation).toBe(2)
    await accept('three', 'message_updated')
    await queue.complete(job)
    const next = (await queue.claim())!
    expect(next.generation).toBe(3)
    await queue.complete(next)
    expect(await queue.claim()).toBeNull()
  })
  it('preserves each created-message obligation', async () => {
    await accept('one', 'message_created', 501)
    await accept('two', 'message_created', 502)
    expect(await database.db.select().from(portalWebhookWork)).toHaveLength(2)
  })
  it('recovers expired leases and fences the old owner', async () => {
    await accept()
    const old = (await queue.claim())!
    expect(await queue.claim()).toBeNull()
    current = new Date(current.getTime() + 301_000)
    const recovered = (await queue.claim())!
    expect(recovered.leaseToken).not.toBe(old.leaseToken)
    expect(await queue.complete(old)).toBe(false)
    await expect(queue.checkpointUnread(old, recipients())).rejects.toThrow(
      'lease lost',
    )
    await queue.checkpointUnread(recovered, recipients())
    expect(await queue.complete(recovered)).toBe(true)
  })
  it('does not resurrect unread after a crash following the unread checkpoint', async () => {
    await accept()
    const job = (await queue.claim())!
    await queue.checkpointUnread(job, recipients())
    expect(
      await database.db.select().from(portalChatUnreadMessages),
    ).toHaveLength(1)
    await createChatUnreadRepository(database.db, {
      tenantId,
      sourceKey: createWebhookSourceKey({
        baseUrl: 'https://chatwoot.example.test',
        accountId: 1,
        inboxId: 1,
      }),
    }).clearThreadUnreadAndCountVisible({
      portalUserId: userId,
      threadId: 'private:me',
      throughMessageId: 10000,
      visibleThreadIds: [],
    })
    await queue.fail(job)
    current = new Date(current.getTime() + 10_000)
    const retry = (await queue.claim())!
    expect(retry.unreadCompleted).toBe(true)
    await queue.checkpointUnread(retry, recipients())
    expect(
      await database.db.select().from(portalChatUnreadMessages),
    ).toHaveLength(0)
  })
  it('does not mark a message unread if the thread was opened while work waited', async () => {
    await accept()
    await createChatUnreadRepository(database.db, {
      tenantId,
      sourceKey: createWebhookSourceKey({
        baseUrl: 'https://chatwoot.example.test',
        accountId: 1,
        inboxId: 1,
      }),
    }).clearThreadUnreadAndCountVisible({
      portalUserId: userId,
      threadId: 'private:me',
      throughMessageId: 10000,
      visibleThreadIds: [],
    })
    await queue.checkpointUnread((await queue.claim())!, recipients())
    expect(
      await database.db.select().from(portalChatUnreadMessages),
    ).toHaveLength(0)
  })
  it('rolls back all unread rows and checkpoint when any insertion fails', async () => {
    await accept()
    const job = (await queue.claim())!
    await expect(
      queue.checkpointUnread(job, [
        ...recipients(),
        { ...recipients()[0]!, portalUserId: 999999 },
      ]),
    ).rejects.toThrow()
    expect(
      await database.db.select().from(portalChatUnreadMessages),
    ).toHaveLength(0)
    expect(
      (await database.db.select().from(portalWebhookWork))[0]!.unreadCompleted,
    ).toBe(false)
  })
  it('backs off failures, retains exhausted work and never cleans it', async () => {
    await accept()
    for (let attempt = 1; attempt <= 10; attempt++) {
      const job = (await queue.claim())!
      expect(job.attempts).toBe(attempt)
      expect((await queue.fail(job)).exhausted).toBe(attempt === 10)
      expect(await queue.claim()).toBeNull()
      current = new Date(current.getTime() + 301_000)
    }
    current = new Date(current.getTime() + 31 * 86400_000)
    expect(await queue.cleanup()).toBe(0)
    expect(
      (await database.db.select().from(portalWebhookWork))[0]!.status,
    ).toBe('exhausted')
  })
  it('uses the database clock despite a future application receipt time', async () => {
    current = new Date(Date.now() + 86400_000)
    await accept('skewed-clock')
    const [work] = await database.db.select().from(portalWebhookWork)
    expect(work!.receivedAt.getTime()).toBeLessThan(current.getTime() - 60_000)
    await createChatUnreadRepository(database.db, {
      tenantId,
      sourceKey: createWebhookSourceKey({
        baseUrl: 'https://chatwoot.example.test',
        accountId: 1,
        inboxId: 1,
      }),
    }).clearThreadUnreadAndCountVisible({
      portalUserId: userId,
      threadId: 'private:me',
      throughMessageId: 10000,
      visibleThreadIds: [],
    })
    await queue.checkpointUnread((await queue.claim())!, recipients())
    expect(
      await database.db.select().from(portalChatUnreadMessages),
    ).toHaveLength(0)
  })
  it('bounds admission and rolls back the rejected delivery, while still accepting duplicates and coalesced updates', async () => {
    await accept('update', 'message_updated')
    const [template] = await database.db.select().from(portalWebhookWork)
    const { id, ...values } = template!
    expect(id).toBeGreaterThan(0)
    await database.db.insert(portalWebhookWork).values(
      Array.from({ length: 999 }, (_, n) => ({
        ...values,
        workKey: `backlog:${n}`,
        eventName: 'message_created',
        chatwootMessageId: n + 1000,
      })),
    )
    await expect(accept('overflow', 'message_created', 10000)).rejects.toThrow(
      'queue is full',
    )
    expect(
      await database.db
        .select()
        .from(chatwootWebhookDeliveries)
        .where(eq(chatwootWebhookDeliveries.deliveryKey, 'overflow')),
    ).toHaveLength(0)
    expect(await accept('update', 'message_updated')).toBe('duplicate')
    expect(await accept('coalesced', 'message_updated')).toBe('recorded')
    expect(await database.db.select().from(portalWebhookWork)).toHaveLength(
      1000,
    )
  })
  it('does not re-enable exhausted update work on a new delivery', async () => {
    await accept('update', 'message_updated')
    await database.db
      .update(portalWebhookWork)
      .set({ status: 'exhausted', attempts: 10 })
    await accept('another-update', 'message_updated')
    expect(await queue.claim()).toBeNull()
    expect(
      (await database.db.select().from(portalWebhookWork))[0]!.status,
    ).toBe('exhausted')
  })
  it('cleans at most 100 completed jobs per pass and preserves pending jobs', async () => {
    await accept()
    const [template] = await database.db.select().from(portalWebhookWork)
    const { id, ...values } = template!
    expect(id).toBeGreaterThan(0)
    await database.db.insert(portalWebhookWork).values(
      Array.from({ length: 101 }, (_, n) => ({
        ...values,
        workKey: `done:${n}`,
        status: 'done',
        updatedAt: new Date(Date.now() - 31 * 86400_000),
      })),
    )
    expect(await queue.cleanup()).toBe(100)
    expect(await database.db.select().from(portalWebhookWork)).toHaveLength(2)
  })
  it('exhausts a repeatedly crashed job even if fail was never called', async () => {
    await accept('crash-loop')
    await database.db.update(portalWebhookWork).set({
      attempts: 10,
      leaseToken: 'dead-process',
      leaseUntil: new Date(0),
    })
    expect(await queue.claim()).toBeNull()
    expect(
      (await database.db.select().from(portalWebhookWork))[0]!.status,
    ).toBe('exhausted')
  })
  it('suppresses a delayed created notification for an already displayed message but preserves newer messages', async () => {
    const unread = createChatUnreadRepository(database.db, {
      tenantId,
      sourceKey: createWebhookSourceKey({
        baseUrl: 'https://chatwoot.example.test',
        accountId: 1,
        inboxId: 1,
      }),
    })
    await unread.clearThreadUnreadAndCountVisible({
      portalUserId: userId,
      threadId: 'private:me',
      visibleThreadIds: [],
      throughMessageId: 501,
    })
    await accept('delayed', 'message_created', 501)
    const delayed = (await queue.claim())!
    await queue.checkpointUnread(delayed, recipients())
    await queue.complete(delayed)
    await accept('newer', 'message_created', 502)
    await queue.checkpointUnread((await queue.claim())!, recipients())
    expect(
      (await database.db.select().from(portalChatUnreadMessages)).map(
        (row) => row.chatwootMessageId,
      ),
    ).toEqual([502])
  })
  it('does not apply an old Chatwoot source watermark to restarted message ids', async () => {
    await createChatUnreadRepository(database.db, {
      tenantId,
      sourceKey: createWebhookSourceKey({
        baseUrl: 'https://previous-chatwoot.example.test',
        accountId: 1,
        inboxId: 1,
      }),
    }).clearThreadUnreadAndCountVisible({
      portalUserId: userId,
      threadId: 'private:me',
      visibleThreadIds: [],
      throughMessageId: 10000,
    })
    await accept('new-source', 'message_created', 1)
    await queue.checkpointUnread((await queue.claim())!, recipients())
    expect(
      (await database.db.select().from(portalChatUnreadMessages)).map(
        (row) => row.chatwootMessageId,
      ),
    ).toEqual([1])
  })
  it('preserves a new-source same-ID unread independently of old-source unread and clears only the current source', async () => {
    const oldSource = createWebhookSourceKey({
      baseUrl: 'https://previous-chatwoot.example.test',
      accountId: 1,
      inboxId: 1,
    })
    const currentSource = createWebhookSourceKey({
      baseUrl: 'https://chatwoot.example.test',
      accountId: 1,
      inboxId: 1,
    })
    const oldUnread = createChatUnreadRepository(database.db, {
      tenantId,
      sourceKey: oldSource,
    })
    await oldUnread.insertUnreadMessages([
      {
        chatwootMessageId: 501,
        now: new Date(),
        portalChatThreadId: threadId,
        portalUserId: userId,
        threadId: 'private:me',
      },
    ])
    await accept('new-source-collision', 'message_created', 501)
    await queue.checkpointUnread((await queue.claim())!, recipients())
    const currentUnread = createChatUnreadRepository(database.db, {
      tenantId,
      sourceKey: currentSource,
    })
    expect(
      await currentUnread.countThreadUnreadForUser({
        portalUserId: userId,
        threadId: 'private:me',
      }),
    ).toBe(1)
    expect(
      await database.db.select().from(portalChatUnreadMessages),
    ).toHaveLength(2)
    await currentUnread.clearThreadUnreadAndCountVisible({
      portalUserId: userId,
      threadId: 'private:me',
      visibleThreadIds: [],
      throughMessageId: 501,
    })
    expect(
      await oldUnread.countThreadUnreadForUser({
        portalUserId: userId,
        threadId: 'private:me',
      }),
    ).toBe(1)
    expect(
      await currentUnread.countThreadUnreadForUser({
        portalUserId: userId,
        threadId: 'private:me',
      }),
    ).toBe(0)
  })
})
