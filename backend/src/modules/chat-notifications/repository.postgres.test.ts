import { randomUUID } from 'node:crypto'

import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDatabaseClient } from '../../db/client.js'
import { runDatabaseMigrations } from '../../db/migrate.js'
import {
  portalPushSubscriptions,
  portalTenants,
  portalUsers,
} from '../../db/schema.js'
import { seedTestTenant } from '../../test/testTenants.js'
import { PushSubscriptionRegistrationBusyError } from './pushSubscriptionRegistrationRepository.js'
import { createChatNotificationsRepository } from './repository.js'

const postgresTestUrl = process.env.PORTAL_POSTGRES_TEST_URL
const describeWithPostgres = postgresTestUrl ? describe : describe.skip

async function retryBusyRegistration(action: () => Promise<void>) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await action()
      return
    } catch (error) {
      if (
        !(error instanceof PushSubscriptionRegistrationBusyError) ||
        attempt === 19
      ) {
        throw error
      }

      await new Promise((resolve) => setTimeout(resolve, 5))
    }
  }
}

describeWithPostgres('chat notifications repository with Postgres', () => {
  let firstDatabase: ReturnType<typeof createDatabaseClient>
  let secondDatabase: ReturnType<typeof createDatabaseClient>
  let firstUserId: number
  let secondUserId: number
  let tenantId: number

  beforeAll(async () => {
    if (!postgresTestUrl) {
      throw new Error('PORTAL_POSTGRES_TEST_URL is required.')
    }

    firstDatabase = createDatabaseClient({
      connectionString: postgresTestUrl,
    })
    secondDatabase = createDatabaseClient({
      connectionString: postgresTestUrl,
    })
    await runDatabaseMigrations(firstDatabase.db)
    const tenantKey = randomUUID()
    tenantId = (
      await seedTestTenant(firstDatabase.db, {
        primaryDomain: `${tenantKey}.f-sec-009.localhost`,
        slug: `f-sec-009-${tenantKey}`,
      })
    ).id

    const users = await firstDatabase.db
      .insert(portalUsers)
      .values([
        {
          email: 'first-user@example.test',
          passwordHash: 'hash',
          tenantId,
        },
        {
          email: 'second-user@example.test',
          passwordHash: 'hash',
          tenantId,
        },
      ])
      .returning({ id: portalUsers.id })

    if (!users[0] || !users[1]) {
      throw new Error('Failed to create concurrent push test users.')
    }

    firstUserId = users[0].id
    secondUserId = users[1].id
  }, 120_000)

  afterAll(async () => {
    if (firstDatabase && tenantId) {
      await firstDatabase.db
        .delete(portalUsers)
        .where(eq(portalUsers.tenantId, tenantId))
      await firstDatabase.db
        .delete(portalTenants)
        .where(eq(portalTenants.id, tenantId))
    }

    const closeTasks: Promise<void>[] = []

    if (firstDatabase) {
      closeTasks.push(firstDatabase.close())
    }
    if (secondDatabase) {
      closeTasks.push(secondDatabase.close())
    }

    await Promise.all(closeTasks)
  }, 120_000)

  it('leaves one active owner when two users concurrently register the same endpoints', async () => {
    const firstRepository = createChatNotificationsRepository(
      firstDatabase.db,
      { tenantId },
    )
    const secondRepository = createChatNotificationsRepository(
      secondDatabase.db,
      { tenantId },
    )
    const endpoints = Array.from(
      { length: 5 },
      (_, index) => `https://push.example.test/concurrent/${index + 1}`,
    )

    for (const [index, endpoint] of endpoints.entries()) {
      const now = new Date(`2026-07-${10 + index}T12:00:00.000Z`)

      await Promise.all([
        retryBusyRegistration(() =>
          firstRepository.savePushSubscription({
            auth: `first-auth-${index}`,
            deviceId: `first-device-${index}`,
            endpoint,
            now,
            p256dh: `first-key-${index}`,
            portalUserId: firstUserId,
            userAgent: 'First Browser',
            vapidKeyId: 'key-id',
            vapidPublicKeyFingerprint: 'fingerprint',
          }),
        ),
        retryBusyRegistration(() =>
          secondRepository.savePushSubscription({
            auth: `second-auth-${index}`,
            deviceId: `second-device-${index}`,
            endpoint,
            now,
            p256dh: `second-key-${index}`,
            portalUserId: secondUserId,
            userAgent: 'Second Browser',
            vapidKeyId: 'key-id',
            vapidPublicKeyFingerprint: 'fingerprint',
          }),
        ),
      ])
    }

    const activeRows = await firstDatabase.db
      .select({
        endpoint: portalPushSubscriptions.endpoint,
        portalUserId: portalPushSubscriptions.portalUserId,
      })
      .from(portalPushSubscriptions)
      .where(
        and(
          eq(portalPushSubscriptions.tenantId, tenantId),
          inArray(portalPushSubscriptions.endpoint, endpoints),
          eq(portalPushSubscriptions.status, 'active'),
        ),
      )

    const activeOwnersByEndpoint = Map.groupBy(
      activeRows,
      ({ endpoint }) => endpoint,
    )

    expect(
      endpoints.every(
        (endpoint) => (activeOwnersByEndpoint.get(endpoint)?.length ?? 0) === 1,
      ),
    ).toBe(true)
    expect(
      activeRows.filter(({ portalUserId }) => portalUserId === firstUserId)
        .length,
    ).toBeLessThanOrEqual(5)
    expect(
      activeRows.filter(({ portalUserId }) => portalUserId === secondUserId)
        .length,
    ).toBeLessThanOrEqual(5)
  }, 60_000)

  it('serializes concurrent registration when cap pruning crosses endpoint owners', async () => {
    const firstRepository = createChatNotificationsRepository(
      firstDatabase.db,
      { tenantId },
    )
    const secondRepository = createChatNotificationsRepository(
      secondDatabase.db,
      { tenantId },
    )
    const firstEndpoint = 'https://push.example.test/cap-prune/first'
    const secondEndpoint = 'https://push.example.test/cap-prune/second'

    await firstDatabase.db
      .update(portalPushSubscriptions)
      .set({ status: 'disabled' })
      .where(
        and(
          eq(portalPushSubscriptions.tenantId, tenantId),
          inArray(portalPushSubscriptions.portalUserId, [
            firstUserId,
            secondUserId,
          ]),
        ),
      )

    for (const index of [0, 1, 2, 3, 4]) {
      const now = new Date(`2026-07-0${index + 1}T12:00:00.000Z`)

      await firstRepository.savePushSubscription({
        auth: `first-seed-auth-${index}`,
        deviceId: `first-seed-device-${index}`,
        endpoint:
          index === 0
            ? secondEndpoint
            : `https://push.example.test/cap-prune/first-${index}`,
        now,
        p256dh: `first-seed-key-${index}`,
        portalUserId: firstUserId,
        userAgent: 'First Browser',
        vapidKeyId: 'key-id',
        vapidPublicKeyFingerprint: 'fingerprint',
      })
      await secondRepository.savePushSubscription({
        auth: `second-seed-auth-${index}`,
        deviceId: `second-seed-device-${index}`,
        endpoint:
          index === 0
            ? firstEndpoint
            : `https://push.example.test/cap-prune/second-${index}`,
        now,
        p256dh: `second-seed-key-${index}`,
        portalUserId: secondUserId,
        userAgent: 'Second Browser',
        vapidKeyId: 'key-id',
        vapidPublicKeyFingerprint: 'fingerprint',
      })
    }

    await Promise.all([
      retryBusyRegistration(() =>
        firstRepository.savePushSubscription({
          auth: 'first-new-auth',
          deviceId: 'first-new-device',
          endpoint: firstEndpoint,
          now: new Date('2026-07-10T12:00:00.000Z'),
          p256dh: 'first-new-key',
          portalUserId: firstUserId,
          userAgent: 'First Browser',
          vapidKeyId: 'key-id',
          vapidPublicKeyFingerprint: 'fingerprint',
        }),
      ),
      retryBusyRegistration(() =>
        secondRepository.savePushSubscription({
          auth: 'second-new-auth',
          deviceId: 'second-new-device',
          endpoint: secondEndpoint,
          now: new Date('2026-07-10T12:00:00.000Z'),
          p256dh: 'second-new-key',
          portalUserId: secondUserId,
          userAgent: 'Second Browser',
          vapidKeyId: 'key-id',
          vapidPublicKeyFingerprint: 'fingerprint',
        }),
      ),
    ])

    const activeRows = await firstDatabase.db
      .select({
        endpoint: portalPushSubscriptions.endpoint,
        portalUserId: portalPushSubscriptions.portalUserId,
      })
      .from(portalPushSubscriptions)
      .where(
        and(
          eq(portalPushSubscriptions.tenantId, tenantId),
          inArray(portalPushSubscriptions.endpoint, [
            firstEndpoint,
            secondEndpoint,
          ]),
          eq(portalPushSubscriptions.status, 'active'),
        ),
      )

    expect(activeRows).toHaveLength(2)
    expect(activeRows).toEqual(
      expect.arrayContaining([
        {
          endpoint: firstEndpoint,
          portalUserId: firstUserId,
        },
        {
          endpoint: secondEndpoint,
          portalUserId: secondUserId,
        },
      ]),
    )
    expect(
      (
        await firstDatabase.db
          .select({ id: portalPushSubscriptions.id })
          .from(portalPushSubscriptions)
          .where(
            and(
              eq(portalPushSubscriptions.tenantId, tenantId),
              eq(portalPushSubscriptions.portalUserId, firstUserId),
              eq(portalPushSubscriptions.status, 'active'),
            ),
          )
      ).length,
    ).toBeLessThanOrEqual(5)
    expect(
      (
        await firstDatabase.db
          .select({ id: portalPushSubscriptions.id })
          .from(portalPushSubscriptions)
          .where(
            and(
              eq(portalPushSubscriptions.tenantId, tenantId),
              eq(portalPushSubscriptions.portalUserId, secondUserId),
              eq(portalPushSubscriptions.status, 'active'),
            ),
          )
      ).length,
    ).toBeLessThanOrEqual(5)
  }, 60_000)

  it('rejects excess concurrent registration instead of waiting on the tenant lock', async () => {
    const repositories = [
      createChatNotificationsRepository(firstDatabase.db, { tenantId }),
      createChatNotificationsRepository(secondDatabase.db, { tenantId }),
    ]
    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, (_, index) => {
        const repository = index % 2 === 0 ? repositories[0] : repositories[1]

        if (!repository) {
          throw new Error('Failed to resolve burst test repository.')
        }

        return repository.savePushSubscription({
          auth: `burst-auth-${index}`,
          deviceId: `burst-device-${index}`,
          endpoint: `https://push.example.test/burst/${index}`,
          now: new Date('2026-07-25T12:00:00.000Z'),
          p256dh: `burst-key-${index}`,
          portalUserId: firstUserId,
          userAgent: 'Burst Browser',
          vapidKeyId: 'key-id',
          vapidPublicKeyFingerprint: 'fingerprint',
        })
      }),
    )

    expect(attempts.some(({ status }) => status === 'rejected')).toBe(true)
    expect(attempts.some(({ status }) => status === 'fulfilled')).toBe(true)
    expect(
      attempts
        .filter(
          (attempt): attempt is PromiseRejectedResult =>
            attempt.status === 'rejected',
        )
        .every(
          ({ reason }) =>
            reason instanceof PushSubscriptionRegistrationBusyError,
        ),
    ).toBe(true)
  }, 60_000)
})
