import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { DatabaseClient } from '../../db/client.js'
import { portalUsers } from '../../db/schema.js'
import { hashPassword } from '../../lib/password.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import { seedTestTenant } from '../../test/testTenants.js'
import { createChatContextRepository } from './repository.js'

async function createUser({
  database,
  email,
  tenantId,
}: {
  database: DatabaseClient
  email: string
  tenantId: number
}) {
  const [user] = await database.db
    .insert(portalUsers)
    .values({
      email,
      passwordHash: await hashPassword('Secret123'),
      tenantId,
    })
    .returning({
      id: portalUsers.id,
    })

  if (!user) {
    throw new Error('Failed to create test portal user.')
  }

  return user
}

describe('createChatContextRepository', () => {
  let database: DatabaseClient

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.close()
  })

  it('allows the same Chatwoot contact and conversation ids in different tenants', async () => {
    const tenantA = await seedTestTenant(database.db)
    const tenantB = await seedTestTenant(database.db, {
      primaryDomain: 'other.localhost',
      slug: 'other',
    })
    const userA = await createUser({
      database,
      email: 'a@company.ru',
      tenantId: tenantA.id,
    })
    const userB = await createUser({
      database,
      email: 'b@company.ru',
      tenantId: tenantB.id,
    })
    const repositoryA = createChatContextRepository(database.db, {
      tenantId: tenantA.id,
    })
    const repositoryB = createChatContextRepository(database.db, {
      tenantId: tenantB.id,
    })
    const now = new Date('2026-05-05T12:00:00.000Z')

    await expect(
      repositoryA.createContactLink({
        chatwootContactId: 44,
        userId: userA.id,
      }),
    ).resolves.toMatchObject({
      chatwootContactId: 44,
      userId: userA.id,
    })
    await expect(
      repositoryB.createContactLink({
        chatwootContactId: 44,
        userId: userB.id,
      }),
    ).resolves.toMatchObject({
      chatwootContactId: 44,
      userId: userB.id,
    })

    await repositoryA.upsertConversationMapping({
      chatwootContactId: 44,
      chatwootConversationId: 101,
      chatwootInboxId: 9,
      now,
      userId: userA.id,
    })
    await repositoryB.upsertConversationMapping({
      chatwootContactId: 44,
      chatwootConversationId: 101,
      chatwootInboxId: 9,
      now,
      userId: userB.id,
    })

    await expect(
      repositoryA.findConversationMappingByUserId(userA.id),
    ).resolves.toMatchObject({
      chatwootContactId: 44,
      chatwootConversationId: 101,
      userId: userA.id,
    })
    await expect(
      repositoryB.findConversationMappingByUserId(userB.id),
    ).resolves.toMatchObject({
      chatwootContactId: 44,
      chatwootConversationId: 101,
      userId: userB.id,
    })
  })
})
