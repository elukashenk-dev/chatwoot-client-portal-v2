import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { DatabaseClient } from '../../db/client.js'
import {
  chatwootWebhookDeliveries,
  portalUserChatwootConversations,
  portalUsers,
} from '../../db/schema.js'
import { hashPassword } from '../../lib/password.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import { seedTestTenant } from '../../test/testTenants.js'
import { createChatwootWebhookRepository } from './repository.js'

describe('createChatwootWebhookRepository', () => {
  let database: DatabaseClient
  let tenantId: number
  let userId: number

  beforeEach(async () => {
    database = await createTestDatabase()
    tenantId = (await seedTestTenant(database.db)).id
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
      throw new Error('Failed to create test portal user.')
    }

    userId = user.id
  })

  afterEach(async () => {
    await database.close()
  })

  it('resolves a portal user conversation mapping by Chatwoot conversation id', async () => {
    await database.db.insert(portalUserChatwootConversations).values({
      chatwootContactId: 44,
      chatwootConversationId: 101,
      chatwootInboxId: 9,
      tenantId,
      userId,
    })
    const repository = createChatwootWebhookRepository(database.db, {
      tenantId,
    })

    await expect(
      repository.findConversationMappingByChatwootConversationId(101),
    ).resolves.toEqual({
      chatwootContactId: 44,
      chatwootConversationId: 101,
      chatwootInboxId: 9,
      userId,
    })
  })

  it('records each Chatwoot delivery key only once', async () => {
    const repository = createChatwootWebhookRepository(database.db, {
      tenantId,
    })
    const now = new Date('2026-04-21T12:00:00.000Z')

    await expect(
      repository.recordDelivery({
        chatwootConversationId: 101,
        chatwootMessageId: 501,
        deliveryKey: 'delivery-1',
        eventName: 'message_created',
        now,
        payloadSha256: 'payload-hash',
        status: 'accepted',
      }),
    ).resolves.toBe('recorded')
    await expect(
      repository.recordDelivery({
        chatwootConversationId: 101,
        chatwootMessageId: 501,
        deliveryKey: 'delivery-1',
        eventName: 'message_created',
        now,
        payloadSha256: 'payload-hash',
        status: 'accepted',
      }),
    ).resolves.toBe('duplicate')

    const deliveries = await database.db
      .select({
        deliveryKey: chatwootWebhookDeliveries.deliveryKey,
        status: chatwootWebhookDeliveries.status,
      })
      .from(chatwootWebhookDeliveries)

    expect(deliveries).toEqual([
      {
        deliveryKey: 'delivery-1',
        status: 'accepted',
      },
    ])
  })

  it('allows the same delivery key in different tenants', async () => {
    const otherTenantId = (
      await seedTestTenant(database.db, {
        primaryDomain: 'other.localhost',
        slug: 'other',
      })
    ).id
    const now = new Date('2026-04-21T12:00:00.000Z')
    const input = {
      chatwootConversationId: 101,
      chatwootMessageId: 501,
      deliveryKey: 'delivery-1',
      eventName: 'message_created',
      now,
      payloadSha256: 'payload-hash',
      status: 'accepted' as const,
    }

    await expect(
      createChatwootWebhookRepository(database.db, {
        tenantId,
      }).recordDelivery(input),
    ).resolves.toBe('recorded')
    await expect(
      createChatwootWebhookRepository(database.db, {
        tenantId: otherTenantId,
      }).recordDelivery(input),
    ).resolves.toBe('recorded')
  })
})
