import { createWebhookSourceKey } from '../chatwoot-webhooks/sourceKey.js'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { createDatabaseClient } from '../../db/client.js'
import { runDatabaseMigrations } from '../../db/migrate.js'
import {
  chatwootWebhookDeliveries,
  portalChatThreads,
  portalChatUnreadMessages,
  portalTenants,
  portalUsers,
  portalWebhookWork,
} from '../../db/schema.js'
import { seedTestTenant } from '../../test/testTenants.js'
import { createChatUnreadRepository } from '../chat-unread/repository.js'
import { createChatwootWebhookRepository } from './repository.js'
import { createWebhookWorkRepository } from './workRepository.js'

const testUrl = process.env.PORTAL_POSTGRES_TEST_URL
const pgDescribe = testUrl ? describe : describe.skip
pgDescribe('durable webhook concurrency on real Postgres', () => {
  let first: ReturnType<typeof createDatabaseClient>
  let second: ReturnType<typeof createDatabaseClient>
  let tenantId: number
  let userId: number
  let threadId: number
  beforeAll(async () => {
    first = createDatabaseClient({ connectionString: testUrl! })
    second = createDatabaseClient({ connectionString: testUrl! })
    await runDatabaseMigrations(first.db)
    const slug = `webhook-${randomUUID()}`
    tenantId = (
      await seedTestTenant(first.db, {
        slug,
        primaryDomain: `${slug}.localhost`,
      })
    ).id
    const [user] = await first.db
      .insert(portalUsers)
      .values({ tenantId, email: 'test@example.test' })
      .returning()
    userId = user!.id
    const [thread] = await first.db
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
  })
  afterAll(async () => {
    if (first && tenantId) {
      await first.db
        .delete(portalWebhookWork)
        .where(eq(portalWebhookWork.tenantId, tenantId))
      await first.db
        .delete(chatwootWebhookDeliveries)
        .where(eq(chatwootWebhookDeliveries.tenantId, tenantId))
      await first.db
        .delete(portalUsers)
        .where(eq(portalUsers.tenantId, tenantId))
      await first.db
        .delete(portalChatThreads)
        .where(eq(portalChatThreads.tenantId, tenantId))
      await first.db.delete(portalTenants).where(eq(portalTenants.id, tenantId))
    }
    await first?.close()
    await second?.close()
  })
  function input(
    key: string,
    messageId: number,
    eventName = 'message_created',
  ) {
    return {
      deliveryKey: key,
      eventName,
      chatwootConversationId: 101,
      chatwootMessageId: messageId,
      source: {
        accountId: 1,
        inboxId: 1,
        baseUrl: 'https://chatwoot.example.test',
      },
      now: new Date(),
      payloadSha256: 'hash',
      status: 'accepted' as const,
    }
  }
  const recipient = () => [
    {
      portalChatThreadId: threadId,
      portalUserId: userId,
      threadId: 'private:me',
      threadType: 'private' as const,
      threadTitle: 'Chat',
    },
  ]

  it('serializes duplicate deliveries and lets only one worker own the job', async () => {
    const results = await Promise.all(
      [first, second].map((database) =>
        createChatwootWebhookRepository(database.db, {
          tenantId,
        }).recordDelivery(input('concurrent', 1001)),
      ),
    )
    expect(results.sort()).toEqual(['duplicate', 'recorded'])
    const claims = await Promise.all(
      [first, second].map((database) =>
        createWebhookWorkRepository(database.db).claim(),
      ),
    )
    expect(claims.filter(Boolean)).toHaveLength(1)
    await createWebhookWorkRepository(first.db).complete(claims.find(Boolean)!)
  })
  it('rolls back acceptance on bounded admission-lock timeout', async () => {
    let release!: () => void
    let locked!: () => void
    const acquired = new Promise<void>((resolve) => {
      locked = resolve
    })
    const blocker = first.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(72814, ${tenantId})`)
      locked()
      await new Promise<void>((resolve) => {
        release = resolve
      })
    })
    await acquired
    try {
      await expect(
        createChatwootWebhookRepository(second.db, { tenantId }).recordDelivery(
          input('lock-timeout', 1002),
        ),
      ).rejects.toThrow()
      expect(
        await second.db
          .select()
          .from(chatwootWebhookDeliveries)
          .where(eq(chatwootWebhookDeliveries.deliveryKey, 'lock-timeout')),
      ).toHaveLength(0)
    } finally {
      release()
      await blocker
    }
  })
  it('serializes competing unread insertion and clear without resurrection', async () => {
    await createChatwootWebhookRepository(first.db, {
      tenantId,
    }).recordDelivery(input('read-race', 1003))
    const job = (await createWebhookWorkRepository(first.db).claim())!
    await Promise.all([
      createWebhookWorkRepository(first.db).checkpointUnread(job, recipient()),
      createChatUnreadRepository(second.db, {
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
      }),
    ])
    expect(
      await first.db
        .select()
        .from(portalChatUnreadMessages)
        .where(eq(portalChatUnreadMessages.tenantId, tenantId)),
    ).toHaveLength(0)
    await createWebhookWorkRepository(first.db).complete(job)
  })
  it('rejects a queued stale source after another transaction reconfigures the tenant', async () => {
    let release!: () => void
    let locked!: () => void
    const acquired = new Promise<void>((resolve) => {
      locked = resolve
    })
    const reconfigure = first.db.transaction(async (tx) => {
      await tx
        .update(portalTenants)
        .set({ chatwootAccountId: 99 })
        .where(eq(portalTenants.id, tenantId))
      locked()
      await new Promise<void>((resolve) => {
        release = resolve
      })
    })
    await acquired
    const accepting = createChatwootWebhookRepository(second.db, {
      tenantId,
    }).recordDelivery(input('source-race', 1004))
    release()
    await reconfigure
    await expect(accepting).rejects.toThrow('source configuration changed')
    expect(
      await first.db
        .select()
        .from(chatwootWebhookDeliveries)
        .where(eq(chatwootWebhookDeliveries.deliveryKey, 'source-race')),
    ).toHaveLength(0)
    await first.db
      .update(portalTenants)
      .set({ chatwootAccountId: 1 })
      .where(eq(portalTenants.id, tenantId))
  })
  it('rolls back unread effects if the lease expires inside the checkpoint transaction', async () => {
    await createChatwootWebhookRepository(first.db, {
      tenantId,
    }).recordDelivery(input('checkpoint-expiry', 20005))
    const queue = createWebhookWorkRepository(first.db)
    const job = (await queue.claim())!
    await first.db.execute(
      sql`create function webhook_test_unread_delay() returns trigger language plpgsql as $$begin perform pg_sleep(0.4); return NEW; end;$$`,
    )
    await first.db.execute(
      sql`create trigger webhook_test_unread_delay before insert on portal_chat_unread_messages for each row execute function webhook_test_unread_delay()`,
    )
    try {
      await first.db
        .update(portalWebhookWork)
        .set({
          leaseUntil: sql`clock_timestamp() + interval '200 milliseconds'`,
        })
        .where(eq(portalWebhookWork.id, job.id))
      await expect(queue.checkpointUnread(job, recipient())).rejects.toThrow(
        'lease lost',
      )
      expect(
        await first.db
          .select()
          .from(portalChatUnreadMessages)
          .where(eq(portalChatUnreadMessages.chatwootMessageId, 20005)),
      ).toHaveLength(0)
      expect(
        (
          await first.db
            .select()
            .from(portalWebhookWork)
            .where(eq(portalWebhookWork.id, job.id))
        )[0]!.unreadCompleted,
      ).toBe(false)
      await first.db
        .update(portalWebhookWork)
        .set({ status: 'exhausted' })
        .where(eq(portalWebhookWork.id, job.id))
    } finally {
      await first.db.execute(
        sql`drop trigger webhook_test_unread_delay on portal_chat_unread_messages`,
      )
      await first.db.execute(sql`drop function webhook_test_unread_delay()`)
    }
  })
  it('rejects acceptance when the mapped conversation moves to another inbox concurrently', async () => {
    let release!: () => void
    let locked!: () => void
    const acquired = new Promise<void>((resolve) => {
      locked = resolve
    })
    const mutation = first.db.transaction(async (tx) => {
      await tx
        .update(portalChatThreads)
        .set({ chatwootInboxId: 99 })
        .where(eq(portalChatThreads.id, threadId))
      locked()
      await new Promise<void>((resolve) => {
        release = resolve
      })
    })
    await acquired
    const accepting = createChatwootWebhookRepository(second.db, {
      tenantId,
    }).recordDelivery(input('mapping-race', 1006))
    release()
    await mutation
    await expect(accepting).rejects.toThrow('source configuration changed')
    expect(
      await first.db
        .select()
        .from(chatwootWebhookDeliveries)
        .where(eq(chatwootWebhookDeliveries.deliveryKey, 'mapping-race')),
    ).toHaveLength(0)
    await first.db
      .update(portalChatThreads)
      .set({ chatwootInboxId: 1 })
      .where(eq(portalChatThreads.id, threadId))
  })
})
