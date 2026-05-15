import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { DatabaseClient } from '../../db/client.js'
import { portalChatMessageSends, portalUsers } from '../../db/schema.js'
import { hashPassword } from '../../lib/password.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import { seedTestTenant } from '../../test/testTenants.js'
import { createChatThreadsRepository } from './repository.js'

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
      fullName: 'Иван Петров',
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

describe('createChatThreadsRepository', () => {
  let database: DatabaseClient

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.close()
  })

  it('upserts one private thread per tenant user', async () => {
    const tenant = await seedTestTenant(database.db)
    const user = await createUser({
      database,
      email: 'ivan@example.com',
      tenantId: tenant.id,
    })
    const repository = createChatThreadsRepository(database.db, {
      tenantId: tenant.id,
    })

    const first = await repository.upsertPrivateThread({
      chatwootContactId: 44,
      chatwootInboxId: 9,
      now: new Date('2026-05-14T12:00:00.000Z'),
      userId: user.id,
    })
    const second = await repository.upsertPrivateThread({
      chatwootContactId: 44,
      chatwootInboxId: 9,
      now: new Date('2026-05-14T12:01:00.000Z'),
      userId: user.id,
    })

    expect(second.id).toBe(first.id)
    expect(second).toMatchObject({
      chatwootContactId: 44,
      chatwootConversationId: null,
      chatwootInboxId: 9,
      portalUserId: user.id,
      threadType: 'private',
    })
  })

  it('upserts one company thread per tenant company contact', async () => {
    const tenant = await seedTestTenant(database.db)
    const repository = createChatThreadsRepository(database.db, {
      tenantId: tenant.id,
    })

    const first = await repository.upsertCompanyThread({
      chatwootContactId: 154,
      chatwootInboxId: 9,
      now: new Date('2026-05-14T12:00:00.000Z'),
    })
    const second = await repository.upsertCompanyThread({
      chatwootContactId: 154,
      chatwootInboxId: 9,
      now: new Date('2026-05-14T12:01:00.000Z'),
    })

    expect(second.id).toBe(first.id)
    expect(second).toMatchObject({
      chatwootContactId: 154,
      chatwootConversationId: null,
      chatwootInboxId: 9,
      portalUserId: null,
      threadType: 'company',
    })
  })

  it('keeps thread uniqueness tenant scoped', async () => {
    const tenantA = await seedTestTenant(database.db)
    const tenantB = await seedTestTenant(database.db, {
      primaryDomain: 'other.localhost',
      slug: 'other',
    })
    const userA = await createUser({
      database,
      email: 'ivan@example.com',
      tenantId: tenantA.id,
    })
    const userB = await createUser({
      database,
      email: 'ivan@example.com',
      tenantId: tenantB.id,
    })
    const repositoryA = createChatThreadsRepository(database.db, {
      tenantId: tenantA.id,
    })
    const repositoryB = createChatThreadsRepository(database.db, {
      tenantId: tenantB.id,
    })

    const privateA = await repositoryA.upsertPrivateThread({
      chatwootContactId: 44,
      chatwootInboxId: 9,
      now: new Date('2026-05-14T12:00:00.000Z'),
      userId: userA.id,
    })
    const privateB = await repositoryB.upsertPrivateThread({
      chatwootContactId: 44,
      chatwootInboxId: 9,
      now: new Date('2026-05-14T12:00:00.000Z'),
      userId: userB.id,
    })
    const companyA = await repositoryA.upsertCompanyThread({
      chatwootContactId: 154,
      chatwootInboxId: 9,
      now: new Date('2026-05-14T12:00:00.000Z'),
    })
    const companyB = await repositoryB.upsertCompanyThread({
      chatwootContactId: 154,
      chatwootInboxId: 9,
      now: new Date('2026-05-14T12:00:00.000Z'),
    })

    expect(privateA.id).not.toBe(privateB.id)
    expect(companyA.id).not.toBe(companyB.id)
  })

  it('updates and finds a thread conversation mapping after lazy bootstrap', async () => {
    const tenant = await seedTestTenant(database.db)
    const user = await createUser({
      database,
      email: 'ivan@example.com',
      tenantId: tenant.id,
    })
    const repository = createChatThreadsRepository(database.db, {
      tenantId: tenant.id,
    })
    const thread = await repository.upsertPrivateThread({
      chatwootContactId: 44,
      chatwootInboxId: 9,
      now: new Date('2026-05-14T12:00:00.000Z'),
      userId: user.id,
    })

    await repository.updateThreadConversation({
      chatwootConversationId: 101,
      chatwootInboxId: 9,
      id: thread.id,
      now: new Date('2026-05-14T12:01:00.000Z'),
    })

    await expect(repository.findThreadById(thread.id)).resolves.toMatchObject({
      chatwootConversationId: 101,
      id: thread.id,
    })
    await expect(
      repository.findThreadByChatwootConversationId(101),
    ).resolves.toMatchObject({
      id: thread.id,
    })
  })

  it('looks up send ledger authors within one portal thread', async () => {
    const tenant = await seedTestTenant(database.db)
    const user = await createUser({
      database,
      email: 'ivan@example.com',
      tenantId: tenant.id,
    })
    const repository = createChatThreadsRepository(database.db, {
      tenantId: tenant.id,
    })
    const thread = await repository.upsertCompanyThread({
      chatwootContactId: 154,
      chatwootInboxId: 9,
      now: new Date('2026-05-14T12:00:00.000Z'),
    })

    await database.db.insert(portalChatMessageSends).values({
      authorDisplayNameSnapshot: 'Иван Петров',
      chatwootMessageId: 501,
      clientMessageKey: 'portal-send:key-1',
      messageKind: 'text',
      payloadSha256: 'payload-hash',
      portalChatThreadId: thread.id,
      primaryConversationId: 101,
      status: 'confirmed',
      tenantId: tenant.id,
      updatedAt: new Date('2026-05-14T12:01:00.000Z'),
      userId: user.id,
    })

    const authors = await repository.findSendLedgerAuthorsByMessageIds({
      messageIds: [501, 999],
      portalChatThreadId: thread.id,
    })

    expect(authors).toEqual(
      new Map([
        [
          501,
          {
            authorDisplayName: 'Иван Петров',
            userId: user.id,
          },
        ],
      ]),
    )
  })
})
