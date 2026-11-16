import { assertWebhookWorkActive } from './workBudget.js'
import { createWebhookSourceKey } from './sourceKey.js'
import { randomUUID } from 'node:crypto'
import { and, asc, eq, lt, lte, or, isNull, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../db/client.js'
import { portalChatUnreadMessages, portalWebhookWork } from '../../db/schema.js'
import type { PushRecipient } from '../chat-notifications/recipientResolver.js'
import { lockReadWatermark } from '../chat-unread/readWatermark.js'

export const WEBHOOK_LEASE_MS = 5 * 60_000
export const WEBHOOK_MAX_ATTEMPTS = 10
export type WebhookWork = typeof portalWebhookWork.$inferSelect
export type ClaimedWebhookWork = WebhookWork & { leaseToken: string }

export function createWebhookWorkRepository(db: AppDatabase, now?: () => Date) {
  async function currentTime(query: Pick<AppDatabase, 'select'> = db) {
    if (now) return now()
    const [clock] = await query
      .select({
        time: sql<string>`clock_timestamp()`.mapWith(
          (value: string) => new Date(value),
        ),
      })
      .from(sql`(values (1)) as clock_tick(n)`)
    if (!clock) throw new Error('Database clock unavailable')
    return clock.time
  }
  function owns(job: ClaimedWebhookWork) {
    return and(
      eq(portalWebhookWork.id, job.id),
      eq(portalWebhookWork.tenantId, job.tenantId),
      eq(portalWebhookWork.leaseToken, job.leaseToken),
      eq(portalWebhookWork.status, 'pending'),
      sql`${portalWebhookWork.leaseUntil} > clock_timestamp()`,
    )
  }
  return {
    async claim(): Promise<ClaimedWebhookWork | null> {
      return db.transaction(async (tx) => {
        const current = await currentTime(tx)
        const [job] = await tx
          .select()
          .from(portalWebhookWork)
          .where(
            and(
              eq(portalWebhookWork.status, 'pending'),
              lte(portalWebhookWork.availableAt, current),
              or(
                isNull(portalWebhookWork.leaseUntil),
                lte(portalWebhookWork.leaseUntil, current),
              ),
            ),
          )
          .orderBy(
            asc(portalWebhookWork.availableAt),
            asc(portalWebhookWork.id),
          )
          .limit(1)
          .for('update', { skipLocked: true })
        if (!job) return null
        if (job.attempts >= WEBHOOK_MAX_ATTEMPTS) {
          await tx
            .update(portalWebhookWork)
            .set({
              status: 'exhausted',
              leaseToken: null,
              leaseUntil: null,
              updatedAt: current,
            })
            .where(eq(portalWebhookWork.id, job.id))
          return null
        }
        const leaseToken = randomUUID()
        const [claimed] = await tx
          .update(portalWebhookWork)
          .set({
            leaseToken,
            leaseUntil: new Date(current.getTime() + WEBHOOK_LEASE_MS),
            attempts: job.attempts + 1,
            updatedAt: current,
          })
          .where(eq(portalWebhookWork.id, job.id))
          .returning()
        return claimed ? { ...claimed, leaseToken } : null
      })
    },
    async renew(job: ClaimedWebhookWork) {
      const rows = await db
        .update(portalWebhookWork)
        .set({
          leaseUntil: new Date(
            (await currentTime()).getTime() + WEBHOOK_LEASE_MS,
          ),
        })
        .where(owns(job))
        .returning({ id: portalWebhookWork.id })
      return rows.length === 1
    },
    async checkpointUnread(
      job: ClaimedWebhookWork,
      recipients: PushRecipient[],
    ) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`set local lock_timeout = '500ms'`)
        await tx.execute(sql`set local statement_timeout = '5s'`)
        assertWebhookWorkActive()
        const [owned] = await tx
          .select()
          .from(portalWebhookWork)
          .where(owns(job))
          .for('update')
        if (!owned) throw new Error('Webhook work lease lost')
        if (owned.unreadCompleted) return
        if (job.chatwootMessageId !== null) {
          // Deterministic order also serializes concurrent worker/reader transactions.
          for (const recipient of [...recipients].sort(
            (a, b) => a.portalUserId - b.portalUserId,
          )) {
            assertWebhookWorkActive()
            const watermark = await lockReadWatermark(tx, {
              tenantId: job.tenantId,
              sourceKey: createWebhookSourceKey({
                baseUrl: job.chatwootBaseUrl,
                accountId: job.chatwootAccountId,
                inboxId: job.chatwootInboxId,
              }),
              portalUserId: recipient.portalUserId,
              threadId: recipient.threadId,
            })
            if (watermark.lastReadMessageId >= job.chatwootMessageId) continue
            await tx
              .insert(portalChatUnreadMessages)
              .values({
                chatwootMessageId: job.chatwootMessageId,
                createdAt: job.receivedAt,
                portalChatThreadId: recipient.portalChatThreadId,
                portalUserId: recipient.portalUserId,
                tenantId: job.tenantId,
                sourceKey: watermark.sourceKey,
                threadId: recipient.threadId,
              })
              .onConflictDoNothing()
          }
        }
        assertWebhookWorkActive()
        const checkpoint = await tx
          .update(portalWebhookWork)
          .set({ unreadCompleted: true })
          .where(owns(job))
          .returning({ id: portalWebhookWork.id })
        if (checkpoint.length !== 1) throw new Error('Webhook work lease lost')
      })
    },
    async complete(job: ClaimedWebhookWork) {
      const rows = await db
        .update(portalWebhookWork)
        .set({
          status: sql`case when ${portalWebhookWork.generation} = ${job.generation} then 'done' else 'pending' end`,
          attempts: 0,
          availableAt: await currentTime(),
          leaseToken: null,
          leaseUntil: null,
          updatedAt: await currentTime(),
        })
        .where(owns(job))
        .returning({ id: portalWebhookWork.id })
      return rows.length === 1
    },
    async fail(job: ClaimedWebhookWork) {
      const exhausted = job.attempts >= WEBHOOK_MAX_ATTEMPTS
      const current = await currentTime()
      const rows = await db
        .update(portalWebhookWork)
        .set({
          status: exhausted ? 'exhausted' : 'pending',
          leaseToken: null,
          leaseUntil: null,
          availableAt: new Date(
            current.getTime() +
              Math.min(300_000, 1000 * 2 ** Math.min(job.attempts, 9)),
          ),
          updatedAt: current,
        })
        .where(owns(job))
        .returning({ id: portalWebhookWork.id })
      return { exhausted, recorded: rows.length === 1 }
    },
    async cleanup() {
      return db.transaction(async (tx) => {
        const rows = await tx
          .select({ id: portalWebhookWork.id })
          .from(portalWebhookWork)
          .where(
            and(
              eq(portalWebhookWork.status, 'done'),
              lt(
                portalWebhookWork.updatedAt,
                new Date((await currentTime(tx)).getTime() - 30 * 86400_000),
              ),
            ),
          )
          .orderBy(asc(portalWebhookWork.updatedAt), asc(portalWebhookWork.id))
          .limit(100)
          .for('update', { skipLocked: true })
        for (const row of rows)
          await tx
            .delete(portalWebhookWork)
            .where(eq(portalWebhookWork.id, row.id))
        return rows.length
      })
    },
  }
}
export type WebhookWorkRepository = ReturnType<
  typeof createWebhookWorkRepository
>
