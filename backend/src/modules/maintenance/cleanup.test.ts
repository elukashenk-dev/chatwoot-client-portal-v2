import { randomUUID } from 'node:crypto'

import { count, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { DatabaseClient } from '../../db/client.js'
import {
  chatwootWebhookDeliveries,
  portalChatMessageSends,
  portalChatThreads,
  portalPushDeliveries,
  portalPushSubscriptions,
  portalRateLimitBuckets,
  portalSessions,
  portalUsers,
  telegramBridgeConfigs,
  telegramBridgeDeliveries,
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
    | typeof portalPushDeliveries
    | typeof portalPushSubscriptions
    | typeof portalRateLimitBuckets
    | typeof portalSessions
    | typeof telegramBridgeDeliveries
    | typeof verificationRecords,
) {
  const [result] = await database.select({ value: count() }).from(table)

  return result?.value ?? 0
}

async function seedTelegramBridgeConfig(
  database: DatabaseClient,
  {
    botId,
    inboxId,
    tenantId,
  }: {
    botId: string
    inboxId: number
    tenantId: number
  },
) {
  const [config] = await database.db
    .insert(telegramBridgeConfigs)
    .values({
      chatwootTelegramInboxId: inboxId,
      displayName: `Bridge ${botId}`,
      id: randomUUID(),
      publicKey: `bridge-${botId}`,
      status: 'active',
      telegramBotId: botId,
      telegramBotTokenCiphertext: 'bot-token-ciphertext',
      telegramBotUsername: `bot_${botId}`,
      telegramSecretTokenCiphertext: 'header-secret-ciphertext',
      telegramWebhookPathSecretCiphertext: 'path-secret-ciphertext',
      tenantId,
    })
    .returning({ id: telegramBridgeConfigs.id })

  if (!config) {
    throw new Error('Failed to create telegram bridge config fixture.')
  }

  return config.id
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
    const [oldPushSubscription] = await database.db
      .insert(portalPushSubscriptions)
      .values({
        auth: 'old-auth',
        deviceId: 'portal-device-old',
        endpoint: 'https://fcm.googleapis.com/fcm/send/old',
        lastErrorAt: daysAgo(now, 45),
        p256dh: 'old-p256dh',
        portalUserId: userId,
        status: 'expired',
        tenantId,
        updatedAt: daysAgo(now, 45),
        vapidKeyId: 'test-key',
        vapidPublicKeyFingerprint: 'sha256-test',
      })
      .returning({ id: portalPushSubscriptions.id })
    const [recentPushSubscription] = await database.db
      .insert(portalPushSubscriptions)
      .values({
        auth: 'recent-auth',
        deviceId: 'portal-device-recent',
        endpoint: 'https://fcm.googleapis.com/fcm/send/recent',
        p256dh: 'recent-p256dh',
        portalUserId: userId,
        status: 'active',
        tenantId,
        updatedAt: daysAgo(now, 2),
        vapidKeyId: 'test-key',
        vapidPublicKeyFingerprint: 'sha256-test',
      })
      .returning({ id: portalPushSubscriptions.id })

    if (!oldPushSubscription || !recentPushSubscription) {
      throw new Error('Failed to create push subscription fixtures.')
    }

    await database.db.insert(portalPushDeliveries).values([
      {
        chatwootMessageId: 501,
        createdAt: daysAgo(now, 31),
        portalChatThreadId,
        portalUserId: userId,
        status: 'sent',
        subscriptionId: oldPushSubscription.id,
        tenantId,
        threadId: 'private:me',
      },
      {
        chatwootMessageId: 502,
        createdAt: daysAgo(now, 2),
        portalChatThreadId,
        portalUserId: userId,
        status: 'sent',
        subscriptionId: recentPushSubscription.id,
        tenantId,
        threadId: 'private:me',
      },
    ])
    const bridgeConfigId = await seedTelegramBridgeConfig(database, {
      botId: '111',
      inboxId: 17,
      tenantId,
    })

    await database.db.insert(telegramBridgeDeliveries).values([
      {
        id: randomUUID(),
        processedAt: daysAgo(now, 31),
        status: 'processed',
        telegramBridgeConfigId: bridgeConfigId,
        updateId: 1001,
        updatedAt: daysAgo(now, 31),
      },
      {
        errorCode: 'Error',
        errorMessage: 'old failure',
        id: randomUUID(),
        status: 'failed',
        telegramBridgeConfigId: bridgeConfigId,
        updateId: 1002,
        updatedAt: daysAgo(now, 31),
      },
      {
        id: randomUUID(),
        status: 'processing',
        telegramBridgeConfigId: bridgeConfigId,
        updateId: 1003,
        updatedAt: daysAgo(now, 31),
      },
      {
        id: randomUUID(),
        processedAt: daysAgo(now, 2),
        status: 'processed',
        telegramBridgeConfigId: bridgeConfigId,
        updateId: 1004,
        updatedAt: daysAgo(now, 2),
      },
    ])

    await expect(
      cleanupPortalMaintenanceData(database.db, {
        now,
      }),
    ).resolves.toEqual({
      chatMessageSendsDeleted: 2,
      dryRun: false,
      pushDeliveriesDeleted: 1,
      pushSubscriptionsDeleted: 1,
      rateLimitBucketsDeleted: 1,
      sessionsDeleted: 1,
      telegramBridgeDeliveriesDeleted: 2,
      verificationRecordsDeleted: 1,
      webhookDeliveriesDeleted: 1,
    })

    await expect(countRows(database.db, portalChatMessageSends)).resolves.toBe(
      1,
    )
    await expect(
      countRows(database.db, chatwootWebhookDeliveries),
    ).resolves.toBe(1)
    await expect(countRows(database.db, portalRateLimitBuckets)).resolves.toBe(
      1,
    )
    await expect(countRows(database.db, portalSessions)).resolves.toBe(1)
    await expect(countRows(database.db, verificationRecords)).resolves.toBe(1)
    await expect(countRows(database.db, portalPushDeliveries)).resolves.toBe(1)
    await expect(countRows(database.db, portalPushSubscriptions)).resolves.toBe(
      1,
    )
    await expect(
      countRows(database.db, telegramBridgeDeliveries),
    ).resolves.toBe(2)

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
    const bridgeConfigId = await seedTelegramBridgeConfig(database, {
      botId: '222',
      inboxId: 17,
      tenantId,
    })
    const otherBridgeConfigId = await seedTelegramBridgeConfig(database, {
      botId: '333',
      inboxId: 17,
      tenantId: otherTenantId,
    })

    await database.db.insert(telegramBridgeDeliveries).values([
      {
        id: randomUUID(),
        processedAt: daysAgo(now, 31),
        status: 'processed',
        telegramBridgeConfigId: bridgeConfigId,
        updateId: 2001,
        updatedAt: daysAgo(now, 31),
      },
      {
        id: randomUUID(),
        processedAt: daysAgo(now, 31),
        status: 'processed',
        telegramBridgeConfigId: otherBridgeConfigId,
        updateId: 2002,
        updatedAt: daysAgo(now, 31),
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
      pushDeliveriesDeleted: 0,
      pushSubscriptionsDeleted: 0,
      telegramBridgeDeliveriesDeleted: 1,
      webhookDeliveriesDeleted: 1,
    })
    await expect(
      countRows(database.db, chatwootWebhookDeliveries),
    ).resolves.toBe(2)
    await expect(
      countRows(database.db, telegramBridgeDeliveries),
    ).resolves.toBe(2)

    await expect(
      cleanupPortalMaintenanceData(database.db, {
        now,
        tenantId,
      }),
    ).resolves.toMatchObject({
      dryRun: false,
      telegramBridgeDeliveriesDeleted: 1,
      webhookDeliveriesDeleted: 1,
    })
    await expect(
      countRows(database.db, chatwootWebhookDeliveries),
    ).resolves.toBe(1)
    await expect(
      countRows(database.db, telegramBridgeDeliveries),
    ).resolves.toBe(1)
  })
})
