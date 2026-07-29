import { asc, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { DatabaseClient } from '../../db/client.js'
import { portalPushSubscriptions, portalUsers } from '../../db/schema.js'
import { seedDefaultTenant } from '../../test/appTestHelpers.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import { createChatNotificationsRepository } from './repository.js'

async function seedUserWithPushSubscriptions() {
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

  if (!user) {
    throw new Error('Failed to create test user.')
  }

  await database.db.insert(portalPushSubscriptions).values([
    {
      auth: 'old-auth',
      createdAt: new Date('2026-05-20T12:00:00.000Z'),
      deviceId: 'portal-device-test-device-1',
      endpoint: 'https://push.example.test/subscription/old',
      p256dh: 'old-key',
      portalUserId: user.id,
      status: 'active',
      tenantId,
      updatedAt: new Date('2026-05-20T12:00:00.000Z'),
      vapidKeyId: 'key-id',
      vapidPublicKeyFingerprint: 'fingerprint',
    },
    {
      auth: 'other-auth',
      createdAt: new Date('2026-05-21T12:00:00.000Z'),
      deviceId: 'portal-device-test-device-2',
      endpoint: 'https://push.example.test/subscription/other',
      p256dh: 'other-key',
      portalUserId: user.id,
      status: 'active',
      tenantId,
      updatedAt: new Date('2026-05-21T12:00:00.000Z'),
      vapidKeyId: 'key-id',
      vapidPublicKeyFingerprint: 'fingerprint',
    },
  ])

  return {
    database,
    tenantId,
    userId: user.id,
  }
}

describe('chat notifications repository', () => {
  let seeded: Awaited<ReturnType<typeof seedUserWithPushSubscriptions>>
  let database: DatabaseClient

  beforeEach(async () => {
    seeded = await seedUserWithPushSubscriptions()
    database = seeded.database
  })

  afterEach(async () => {
    await database.close()
  })

  it('disables stale active push subscriptions for the same device only', async () => {
    const repository = createChatNotificationsRepository(database.db, {
      tenantId: seeded.tenantId,
    })

    await repository.savePushSubscription({
      auth: 'new-auth',
      deviceId: 'portal-device-test-device-1',
      endpoint: 'https://push.example.test/subscription/new',
      now: new Date('2026-06-01T12:00:00.000Z'),
      p256dh: 'new-key',
      portalUserId: seeded.userId,
      userAgent: 'Test Browser',
      vapidKeyId: 'key-id',
      vapidPublicKeyFingerprint: 'fingerprint',
    })

    const rows = await database.db
      .select({
        deviceId: portalPushSubscriptions.deviceId,
        endpoint: portalPushSubscriptions.endpoint,
        status: portalPushSubscriptions.status,
      })
      .from(portalPushSubscriptions)
      .where(eq(portalPushSubscriptions.portalUserId, seeded.userId))
      .orderBy(asc(portalPushSubscriptions.endpoint))

    expect(rows).toEqual([
      {
        deviceId: 'portal-device-test-device-1',
        endpoint: 'https://push.example.test/subscription/new',
        status: 'active',
      },
      {
        deviceId: 'portal-device-test-device-1',
        endpoint: 'https://push.example.test/subscription/old',
        status: 'disabled',
      },
      {
        deviceId: 'portal-device-test-device-2',
        endpoint: 'https://push.example.test/subscription/other',
        status: 'active',
      },
    ])
  })

  it('returns at most the five most recently active push subscriptions', async () => {
    await database.db.insert(portalPushSubscriptions).values(
      [3, 4, 5, 6].map((deviceNumber) => ({
        auth: `auth-${deviceNumber}`,
        createdAt: new Date(`2026-05-${19 + deviceNumber}T12:00:00.000Z`),
        deviceId: `portal-device-test-device-${deviceNumber}`,
        endpoint: `https://push.example.test/subscription/${deviceNumber}`,
        p256dh: `key-${deviceNumber}`,
        portalUserId: seeded.userId,
        status: 'active',
        tenantId: seeded.tenantId,
        updatedAt: new Date(`2026-05-${19 + deviceNumber}T12:00:00.000Z`),
        vapidKeyId: 'key-id',
        vapidPublicKeyFingerprint: 'fingerprint',
      })),
    )

    const repository = createChatNotificationsRepository(database.db, {
      tenantId: seeded.tenantId,
    })

    const subscriptions = await repository.listActivePushSubscriptions(
      seeded.userId,
    )

    expect(subscriptions.map(({ endpoint }) => endpoint)).toEqual([
      'https://push.example.test/subscription/6',
      'https://push.example.test/subscription/5',
      'https://push.example.test/subscription/4',
      'https://push.example.test/subscription/3',
      'https://push.example.test/subscription/other',
    ])
  })

  it('keeps only the five most recently active subscriptions when saving', async () => {
    const repository = createChatNotificationsRepository(database.db, {
      tenantId: seeded.tenantId,
    })

    for (const deviceNumber of [3, 4, 5, 6]) {
      await repository.savePushSubscription({
        auth: `auth-${deviceNumber}`,
        deviceId: `portal-device-test-device-${deviceNumber}`,
        endpoint: `https://push.example.test/subscription/${deviceNumber}`,
        now: new Date(`2026-05-${19 + deviceNumber}T12:00:00.000Z`),
        p256dh: `key-${deviceNumber}`,
        portalUserId: seeded.userId,
        userAgent: 'Test Browser',
        vapidKeyId: 'key-id',
        vapidPublicKeyFingerprint: 'fingerprint',
      })
    }

    const rows = await database.db
      .select({
        endpoint: portalPushSubscriptions.endpoint,
        status: portalPushSubscriptions.status,
      })
      .from(portalPushSubscriptions)
      .where(eq(portalPushSubscriptions.portalUserId, seeded.userId))
      .orderBy(asc(portalPushSubscriptions.endpoint))

    expect(rows).toEqual([
      {
        endpoint: 'https://push.example.test/subscription/3',
        status: 'active',
      },
      {
        endpoint: 'https://push.example.test/subscription/4',
        status: 'active',
      },
      {
        endpoint: 'https://push.example.test/subscription/5',
        status: 'active',
      },
      {
        endpoint: 'https://push.example.test/subscription/6',
        status: 'active',
      },
      {
        endpoint: 'https://push.example.test/subscription/old',
        status: 'disabled',
      },
      {
        endpoint: 'https://push.example.test/subscription/other',
        status: 'active',
      },
    ])
  })
})
