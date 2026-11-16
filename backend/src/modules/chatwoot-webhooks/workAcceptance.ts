import { createWebhookSourceKey } from './sourceKey.js'
import { and, eq, ne, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../db/client.js'
import {
  portalChatThreads,
  portalTenants,
  portalWebhookWork,
} from '../../db/schema.js'
import { ApiError } from '../../lib/errors.js'

export const WEBHOOK_BACKLOG_LIMIT = 1_000

type Transaction = Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export async function enqueueWebhookWork(
  tx: Transaction,
  input: {
    tenantId: number
    chatwootConversationId: number | null
    chatwootMessageId: number | null
    deliveryKey: string
    eventName: string
    now: Date
    source?: { accountId: number; inboxId: number; baseUrl: string }
  },
) {
  // Serialize only this tenant's short admission transactions, never external work.
  await tx.execute(sql`select pg_advisory_xact_lock(72814, ${input.tenantId})`)
  const [tenant] = await tx
    .select()
    .from(portalTenants)
    .where(eq(portalTenants.id, input.tenantId))
    .for('share')
  const [mapping] = await tx
    .select()
    .from(portalChatThreads)
    .where(
      and(
        eq(portalChatThreads.tenantId, input.tenantId),
        eq(
          portalChatThreads.chatwootConversationId,
          input.chatwootConversationId ?? -1,
        ),
      ),
    )
    .limit(1)
    .for('share')
  if (
    !tenant ||
    tenant.status !== 'active' ||
    !mapping ||
    !input.chatwootConversationId
  ) {
    throw new ApiError(
      503,
      'webhook_mapping_changed',
      'Webhook mapping is no longer active.',
    )
  }
  if (
    !input.source ||
    tenant.chatwootAccountId !== input.source.accountId ||
    tenant.chatwootPortalInboxId !== input.source.inboxId ||
    tenant.chatwootBaseUrl !== input.source.baseUrl ||
    mapping.chatwootInboxId !== input.source.inboxId
  ) {
    throw new ApiError(
      503,
      'webhook_source_changed',
      'Webhook source configuration changed.',
    )
  }
  const [{ receiptTime } = { receiptTime: new Date(0) }] = await tx
    .select({
      receiptTime: sql<string>`clock_timestamp()`.mapWith(
        (value: string) => new Date(value),
      ),
    })
    .from(portalTenants)
    .where(eq(portalTenants.id, input.tenantId))
  const sourceKey = createWebhookSourceKey(input.source)
  const created = input.eventName === 'message_created'
  const workKey = created
    ? `${sourceKey}:created:${input.chatwootMessageId}`
    : `${sourceKey}:updated:${input.chatwootConversationId}`
  const [existing] = await tx
    .select()
    .from(portalWebhookWork)
    .where(
      and(
        eq(portalWebhookWork.tenantId, input.tenantId),
        eq(portalWebhookWork.workKey, workKey),
      ),
    )
    .for('update')
  if (created && input.chatwootMessageId === null)
    throw new Error('Message id required')
  if (created && existing) return
  if (!existing || existing.status === 'done') {
    const backlog = await tx
      .select({ id: portalWebhookWork.id })
      .from(portalWebhookWork)
      .where(
        and(
          eq(portalWebhookWork.tenantId, input.tenantId),
          ne(portalWebhookWork.status, 'done'),
        ),
      )
      .limit(WEBHOOK_BACKLOG_LIMIT)
    if (backlog.length === WEBHOOK_BACKLOG_LIMIT) {
      throw new ApiError(
        503,
        'webhook_queue_full',
        'Webhook processing queue is full.',
      )
    }
  }
  const values = {
    chatwootAccountId: tenant.chatwootAccountId,
    chatwootBaseUrl: tenant.chatwootBaseUrl,
    chatwootConversationId: input.chatwootConversationId,
    chatwootInboxId: tenant.chatwootPortalInboxId,
    chatwootMessageId: input.chatwootMessageId,
    eventName: input.eventName,
    portalChatThreadId: mapping.id,
    tenantId: input.tenantId,
    workKey,
  }
  if (existing) {
    await tx
      .update(portalWebhookWork)
      .set({
        ...values,
        generation: sql`${portalWebhookWork.generation} + 1`,
        status: existing.status === 'exhausted' ? 'exhausted' : 'pending',
        // Do not remove a running lease or bypass failure backoff.
        availableAt:
          existing.status === 'done' ? receiptTime : existing.availableAt,
        attempts: existing.status === 'done' ? 0 : existing.attempts,
        updatedAt: receiptTime,
      })
      .where(eq(portalWebhookWork.id, existing.id))
  } else {
    await tx.insert(portalWebhookWork).values({
      ...values,
      receivedAt: receiptTime,
      updatedAt: receiptTime,
      availableAt: receiptTime,
    })
  }
}
