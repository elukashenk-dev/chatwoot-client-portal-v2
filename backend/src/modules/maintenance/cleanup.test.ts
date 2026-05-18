import { count, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { DatabaseClient } from '../../db/client.js'
import {
  chatwootWebhookDeliveries,
  portalChatMessageSends,
  portalChatThreads,
  portalRateLimitBuckets,
  portalSessions,
  portalUsers,
  verificationRecords,
} from '../../db/schema.js'
import { hashPassword } from '../../lib/password.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import { seedTestTenant } from '../../test/testTenants.js'
import { cleanupPortalMaintenanceData } from './cleanup.js'

function daysAgo(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
}

function hoursAgo(now: Date, hours: number) {
  return new Date(now.getTime() - hours * 60 * 60 * 1000)
}

async function countRows(
  database: DatabaseClient['db'],
  table:
    | typeof chatwootWebhookDeliveries
    | typeof portalChatMessageSends
    | typeof portalRateLimitBuckets
    | typeof portalSessions
    | typeof verificationRecords,
) {
  const [result] = await database.select({ value: count() }).from(table)

  return result?.value ?? 0
}

describe('cleanupPortalMaintenanceData', () => {
  let database: DatabaseClient
  let tenantId: number
  let otherTenantId: number
  let portalChatThreadId: number
  let userId: number
  const now = new Date('2026-05-18T12:00:00.000Z')

  beforeEach(async () => {
    database = await createTestDatabase()
    tenantId = (await seedTestTenant(database.db)).id
    otherTenantId = (
      await seedTestTenant(database.db, {
        primaryDomain: 'other.localhost',
        slug: 'other',
      })
    ).id

    const [user] = await database.db
      .insert(portalUsers)
      .values({
        email: 'name@company.ru',
        passwordHash: await hashPassword('Secret123'),
        tenantId,
      })
      .returning({
        id: portalUsers.id,
      })

    if (!user) {
      throw new Error('Failed to create test user.')
    }

    userId = user.id

    const [thread] = await database.db
      .insert(portalChatThreads)
      .values({
        chatwootContactId: 44,
        chatwootConversationId: 101,
        chatwootInboxId: 9,
        portalUserId: userId,
        tenantId,
        threadType: 'private',
      })
      .returning({
        id: portalChatThreads.id,
      })

    if (!thread) {
      throw new Error('Failed to create test chat thread.')
    }

    portalChatThreadId = thread.id
  })

  afterEach(async () => {
    await database.close()
  })

  it('deletes only expired service traces and keeps active chat threads', async () => {
    await database.db.insert(portalChatMessageSends).values([
      {
        chatwootMessageId: 501,
        clientMessageKey: 'old-confirmed',
        confirmedAt: daysAgo(now, 91),
        messageKind: 'text',
        payloadSha256: 'old-confirmed-hash',
        portalChatThreadId,
        status: 'confirmed',
        tenantId,
        updatedAt: daysAgo(now, 91),
        userId,
      },
      {
        clientMessageKey: 'old-processing',
        messageKind: 'text',
        payloadSha256: 'old-processing-hash',
        portalChatThreadId,
        status: 'processing',
        tenantId,
        updatedAt: hoursAgo(now, 25),
        userId,
      },
      {
        chatwootMessageId: 502,
        clientMessageKey: 'recent-confirmed',
        confirmedAt: daysAgo(now, 2),
        messageKind: 'text',
        payloadSha256: 'recent-confirmed-hash',
        portalChatThreadId,
        status: 'confirmed',
        tenantId,
        updatedAt: daysAgo(now, 2),
        userId,
      },
    ])
    await database.db.insert(chatwootWebhookDeliveries).values([
      {
        chatwootConversationId: 101,
        chatwootMessageId: 501,
        deliveryKey: 'old-delivery',
        eventName: 'message_created',
        payloadSha256: 'old-delivery-hash',
        receivedAt: daysAgo(now, 31),
        status: 'accepted',
        tenantId,
      },
      {
        chatwootConversationId: 101,
        chatwootMessageId: 502,
        deliveryKey: 'recent-delivery',
        eventName: 'message_created',
        payloadSha256: 'recent-delivery-hash',
        receivedAt: daysAgo(now, 2),
        status: 'accepted',
        tenantId,
      },
    ])
    await database.db.insert(portalRateLimitBuckets).values([
      {
        count: 3,
        resetAt: daysAgo(now, 2),
        scope: 'auth:login',
        subjectKey: 'old',
        tenantId,
        updatedAt: daysAgo(now, 2),
      },
      {
        count: 1,
        resetAt: hoursAgo(now, 6),
        scope: 'auth:login',
        subjectKey: 'recent',
        tenantId,
      },
    ])
    await database.db.insert(portalSessions).values([
      {
        expiresAt: daysAgo(now, 8),
        lastSeenAt: daysAgo(now, 9),
        tenantId,
        tokenHash: 'old-session',
        userId,
      },
      {
        expiresAt: daysAgo(now, 1),
        lastSeenAt: daysAgo(now, 1),
        tenantId,
        tokenHash: 'recent-session',
        userId,
      },
    ])
    await database.db.insert(verificationRecords).values([
      {
        codeHash: 'old-code',
        email: 'name@company.ru',
        expiresAt: daysAgo(now, 31),
        lastSentAt: daysAgo(now, 31),
        purpose: 'registration',
        resendNotBefore: daysAgo(now, 31),
        status: 'expired',
        tenantId,
      },
      {
        codeHash: 'recent-code',
        email: 'name@company.ru',
        expiresAt: daysAgo(now, 2),
        lastSentAt: daysAgo(now, 2),
        purpose: 'registration',
        resendNotBefore: daysAgo(now, 2),
        status: 'expired',
        tenantId,
      },
    ])

    await expect(
      cleanupPortalMaintenanceData(database.db, {
        now,
      }),
    ).resolves.toEqual({
      chatMessageSendsDeleted: 2,
      dryRun: false,
      rateLimitBucketsDeleted: 1,
      sessionsDeleted: 1,
      verificationRecordsDeleted: 1,
      webhookDeliveriesDeleted: 1,
    })

    await expect(
      countRows(database.db, portalChatMessageSends),
    ).resolves.toBe(1)
    await expect(
      countRows(database.db, chatwootWebhookDeliveries),
    ).resolves.toBe(1)
    await expect(countRows(database.db, portalRateLimitBuckets)).resolves.toBe(
      1,
    )
    await expect(countRows(database.db, portalSessions)).resolves.toBe(1)
    await expect(countRows(database.db, verificationRecords)).resolves.toBe(1)

    const [threadCount] = await database.db
      .select({ value: count() })
      .from(portalChatThreads)
      .where(eq(portalChatThreads.id, portalChatThreadId))
    expect(threadCount?.value).toBe(1)
  })

  it('supports dry-run and tenant-scoped cleanup', async () => {
    await database.db.insert(chatwootWebhookDeliveries).values([
      {
        deliveryKey: 'tenant-old-delivery',
        eventName: 'message_created',
        payloadSha256: 'tenant-old-delivery-hash',
        receivedAt: daysAgo(now, 31),
        status: 'accepted',
        tenantId,
      },
      {
        deliveryKey: 'other-old-delivery',
        eventName: 'message_created',
        payloadSha256: 'other-old-delivery-hash',
        receivedAt: daysAgo(now, 31),
        status: 'accepted',
        tenantId: otherTenantId,
      },
    ])

    await expect(
      cleanupPortalMaintenanceData(database.db, {
        dryRun: true,
        now,
        tenantId,
      }),
    ).resolves.toMatchObject({
      dryRun: true,
      webhookDeliveriesDeleted: 1,
    })
    await expect(
      countRows(database.db, chatwootWebhookDeliveries),
    ).resolves.toBe(2)

    await expect(
      cleanupPortalMaintenanceData(database.db, {
        now,
        tenantId,
      }),
    ).resolves.toMatchObject({
      dryRun: false,
      webhookDeliveriesDeleted: 1,
    })
    await expect(
      countRows(database.db, chatwootWebhookDeliveries),
    ).resolves.toBe(1)
  })
})
