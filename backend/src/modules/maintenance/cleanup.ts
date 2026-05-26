import { and, count, eq, inArray, lt, or, sql, type SQL } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import {
  chatwootWebhookDeliveries,
  portalChatMessageSends,
  portalPushDeliveries,
  portalPushSubscriptions,
  portalRateLimitBuckets,
  portalSessions,
  verificationRecords,
} from '../../db/schema.js'

export type PortalMaintenanceRetention = {
  chatMessageSendProcessingHours: number
  chatMessageSendStableDays: number
  pushDeliveryDays: number
  pushSubscriptionInactiveDays: number
  rateLimitExpiredHours: number
  sessionExpiredDays: number
  verificationRecordExpiredDays: number
  webhookDeliveryDays: number
}

export type CleanupPortalMaintenanceDataOptions = {
  dryRun?: boolean
  now?: Date
  retention?: Partial<PortalMaintenanceRetention>
  tenantId?: number
}

export type CleanupPortalMaintenanceDataResult = {
  chatMessageSendsDeleted: number
  dryRun: boolean
  pushDeliveriesDeleted: number
  pushSubscriptionsDeleted: number
  rateLimitBucketsDeleted: number
  sessionsDeleted: number
  verificationRecordsDeleted: number
  webhookDeliveriesDeleted: number
}

export const DEFAULT_PORTAL_MAINTENANCE_RETENTION = {
  chatMessageSendProcessingHours: 24,
  chatMessageSendStableDays: 90,
  pushDeliveryDays: 30,
  pushSubscriptionInactiveDays: 30,
  rateLimitExpiredHours: 24,
  sessionExpiredDays: 7,
  verificationRecordExpiredDays: 30,
  webhookDeliveryDays: 30,
} satisfies PortalMaintenanceRetention

function hoursBefore(now: Date, hours: number) {
  return new Date(now.getTime() - hours * 60 * 60 * 1000)
}

function daysBefore(now: Date, days: number) {
  return hoursBefore(now, days * 24)
}

function normalizeRetention(
  retention: Partial<PortalMaintenanceRetention> | undefined,
) {
  const normalizedRetention = {
    ...DEFAULT_PORTAL_MAINTENANCE_RETENTION,
    ...retention,
  }

  for (const [key, value] of Object.entries(normalizedRetention)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Maintenance retention "${key}" must be positive.`)
    }
  }

  return normalizedRetention
}

async function countChatMessageSends(db: AppDatabase, where: SQL | undefined) {
  const [result] = await db
    .select({ value: count() })
    .from(portalChatMessageSends)
    .where(where)

  return result?.value ?? 0
}

async function deleteChatMessageSends(db: AppDatabase, where: SQL | undefined) {
  const candidates = await countChatMessageSends(db, where)
  await db.delete(portalChatMessageSends).where(where)

  return candidates
}

async function countWebhookDeliveries(db: AppDatabase, where: SQL | undefined) {
  const [result] = await db
    .select({ value: count() })
    .from(chatwootWebhookDeliveries)
    .where(where)

  return result?.value ?? 0
}

async function deleteWebhookDeliveries(
  db: AppDatabase,
  where: SQL | undefined,
) {
  const candidates = await countWebhookDeliveries(db, where)
  await db.delete(chatwootWebhookDeliveries).where(where)

  return candidates
}

async function countRateLimitBuckets(db: AppDatabase, where: SQL | undefined) {
  const [result] = await db
    .select({ value: count() })
    .from(portalRateLimitBuckets)
    .where(where)

  return result?.value ?? 0
}

async function countPushDeliveries(db: AppDatabase, where: SQL | undefined) {
  const [result] = await db
    .select({ value: count() })
    .from(portalPushDeliveries)
    .where(where)

  return result?.value ?? 0
}

async function deletePushDeliveries(db: AppDatabase, where: SQL | undefined) {
  const candidates = await countPushDeliveries(db, where)
  await db.delete(portalPushDeliveries).where(where)

  return candidates
}

async function countPushSubscriptions(db: AppDatabase, where: SQL | undefined) {
  const [result] = await db
    .select({ value: count() })
    .from(portalPushSubscriptions)
    .where(where)

  return result?.value ?? 0
}

async function deletePushSubscriptions(
  db: AppDatabase,
  where: SQL | undefined,
) {
  const candidates = await countPushSubscriptions(db, where)
  await db.delete(portalPushSubscriptions).where(where)

  return candidates
}

async function deleteRateLimitBuckets(db: AppDatabase, where: SQL | undefined) {
  const candidates = await countRateLimitBuckets(db, where)
  await db.delete(portalRateLimitBuckets).where(where)

  return candidates
}

async function countSessions(db: AppDatabase, where: SQL | undefined) {
  const [result] = await db
    .select({ value: count() })
    .from(portalSessions)
    .where(where)

  return result?.value ?? 0
}

async function deleteSessions(db: AppDatabase, where: SQL | undefined) {
  const candidates = await countSessions(db, where)
  await db.delete(portalSessions).where(where)

  return candidates
}

async function countVerificationRecords(
  db: AppDatabase,
  where: SQL | undefined,
) {
  const [result] = await db
    .select({ value: count() })
    .from(verificationRecords)
    .where(where)

  return result?.value ?? 0
}

async function deleteVerificationRecords(
  db: AppDatabase,
  where: SQL | undefined,
) {
  const candidates = await countVerificationRecords(db, where)
  await db.delete(verificationRecords).where(where)

  return candidates
}

export async function cleanupPortalMaintenanceData(
  db: AppDatabase,
  {
    dryRun = false,
    now = new Date(),
    retention: inputRetention,
    tenantId,
  }: CleanupPortalMaintenanceDataOptions = {},
): Promise<CleanupPortalMaintenanceDataResult> {
  const retention = normalizeRetention(inputRetention)
  const chatMessageSendWhere = and(
    tenantId === undefined
      ? undefined
      : eq(portalChatMessageSends.tenantId, tenantId),
    or(
      and(
        inArray(portalChatMessageSends.status, ['confirmed', 'failed']),
        lt(
          portalChatMessageSends.updatedAt,
          daysBefore(now, retention.chatMessageSendStableDays),
        ),
      ),
      and(
        eq(portalChatMessageSends.status, 'processing'),
        lt(
          portalChatMessageSends.updatedAt,
          hoursBefore(now, retention.chatMessageSendProcessingHours),
        ),
      ),
    ),
  )
  const webhookDeliveryWhere = and(
    tenantId === undefined
      ? undefined
      : eq(chatwootWebhookDeliveries.tenantId, tenantId),
    lt(
      chatwootWebhookDeliveries.receivedAt,
      daysBefore(now, retention.webhookDeliveryDays),
    ),
  )
  const pushDeliveryCutoff = daysBefore(now, retention.pushDeliveryDays)
  const pushDeliveryWhere = and(
    tenantId === undefined
      ? undefined
      : eq(portalPushDeliveries.tenantId, tenantId),
    lt(portalPushDeliveries.createdAt, pushDeliveryCutoff),
  )
  const pushSubscriptionWhere = and(
    tenantId === undefined
      ? undefined
      : eq(portalPushSubscriptions.tenantId, tenantId),
    inArray(portalPushSubscriptions.status, ['disabled', 'expired']),
    lt(
      portalPushSubscriptions.updatedAt,
      daysBefore(now, retention.pushSubscriptionInactiveDays),
    ),
    sql`not exists (
      select 1
      from ${portalPushDeliveries}
      where ${portalPushDeliveries.subscriptionId} = ${portalPushSubscriptions.id}
        and ${portalPushDeliveries.createdAt} >= ${pushDeliveryCutoff}
    )`,
  )
  const rateLimitBucketWhere = and(
    tenantId === undefined
      ? undefined
      : eq(portalRateLimitBuckets.tenantId, tenantId),
    lt(
      portalRateLimitBuckets.resetAt,
      hoursBefore(now, retention.rateLimitExpiredHours),
    ),
  )
  const sessionWhere = and(
    tenantId === undefined ? undefined : eq(portalSessions.tenantId, tenantId),
    lt(portalSessions.expiresAt, daysBefore(now, retention.sessionExpiredDays)),
  )
  const verificationRecordWhere = and(
    tenantId === undefined
      ? undefined
      : eq(verificationRecords.tenantId, tenantId),
    lt(
      verificationRecords.expiresAt,
      daysBefore(now, retention.verificationRecordExpiredDays),
    ),
  )

  if (dryRun) {
    return {
      chatMessageSendsDeleted: await countChatMessageSends(
        db,
        chatMessageSendWhere,
      ),
      dryRun: true,
      pushDeliveriesDeleted: await countPushDeliveries(db, pushDeliveryWhere),
      pushSubscriptionsDeleted: await countPushSubscriptions(
        db,
        pushSubscriptionWhere,
      ),
      rateLimitBucketsDeleted: await countRateLimitBuckets(
        db,
        rateLimitBucketWhere,
      ),
      sessionsDeleted: await countSessions(db, sessionWhere),
      verificationRecordsDeleted: await countVerificationRecords(
        db,
        verificationRecordWhere,
      ),
      webhookDeliveriesDeleted: await countWebhookDeliveries(
        db,
        webhookDeliveryWhere,
      ),
    }
  }

  return {
    chatMessageSendsDeleted: await deleteChatMessageSends(
      db,
      chatMessageSendWhere,
    ),
    dryRun: false,
    pushDeliveriesDeleted: await deletePushDeliveries(db, pushDeliveryWhere),
    pushSubscriptionsDeleted: await deletePushSubscriptions(
      db,
      pushSubscriptionWhere,
    ),
    rateLimitBucketsDeleted: await deleteRateLimitBuckets(
      db,
      rateLimitBucketWhere,
    ),
    sessionsDeleted: await deleteSessions(db, sessionWhere),
    verificationRecordsDeleted: await deleteVerificationRecords(
      db,
      verificationRecordWhere,
    ),
    webhookDeliveriesDeleted: await deleteWebhookDeliveries(
      db,
      webhookDeliveryWhere,
    ),
  }
}
