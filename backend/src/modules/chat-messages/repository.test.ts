import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { DatabaseClient } from '../../db/client.js'
import { portalUsers } from '../../db/schema.js'
import { hashPassword } from '../../lib/password.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import { seedTestTenant } from '../../test/testTenants.js'
import { createChatMessagesRepository } from './repository.js'

describe('createChatMessagesRepository', () => {
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

  it('acquires, confirms, and replays a send ledger entry by scope', async () => {
    const repository = createChatMessagesRepository(database.db, { tenantId })
    const now = new Date('2026-04-21T12:00:00.000Z')

    await expect(
      repository.acquireSendLedgerEntry({
        clientMessageKey: 'portal-send:key-1',
        messageKind: 'text',
        now,
        payloadSha256: 'payload-hash',
        primaryConversationId: 101,
        processingToken: 'processing-token-1',
        staleProcessingBefore: new Date('2026-04-21T11:58:00.000Z'),
        userId,
      }),
    ).resolves.toMatchObject({
      outcome: 'acquired',
    })

    await repository.markSendLedgerEntryConfirmed({
      chatwootMessageId: 501,
      clientMessageKey: 'portal-send:key-1',
      now,
      primaryConversationId: 101,
      processingToken: 'processing-token-1',
      userId,
    })

    await expect(
      repository.acquireSendLedgerEntry({
        clientMessageKey: 'portal-send:key-1',
        messageKind: 'text',
        now,
        payloadSha256: 'payload-hash',
        primaryConversationId: 101,
        processingToken: 'processing-token-2',
        staleProcessingBefore: new Date('2026-04-21T11:58:00.000Z'),
        userId,
      }),
    ).resolves.toMatchObject({
      entry: {
        chatwootMessageId: 501,
        status: 'confirmed',
      },
      outcome: 'confirmed',
    })
  })

  it('rejects reusing a client message key for a different text payload', async () => {
    const repository = createChatMessagesRepository(database.db, { tenantId })
    const now = new Date('2026-04-21T12:00:00.000Z')

    await repository.acquireSendLedgerEntry({
      clientMessageKey: 'portal-send:key-1',
      messageKind: 'text',
      now,
      payloadSha256: 'first-payload',
      primaryConversationId: 101,
      processingToken: 'processing-token-1',
      staleProcessingBefore: new Date('2026-04-21T11:58:00.000Z'),
      userId,
    })

    await expect(
      repository.acquireSendLedgerEntry({
        clientMessageKey: 'portal-send:key-1',
        messageKind: 'text',
        now,
        payloadSha256: 'second-payload',
        primaryConversationId: 101,
        processingToken: 'processing-token-2',
        staleProcessingBefore: new Date('2026-04-21T11:58:00.000Z'),
        userId,
      }),
    ).resolves.toMatchObject({
      outcome: 'payload_mismatch',
    })
  })

  it('keeps send key scope separate for different users in the same conversation', async () => {
    const repository = createChatMessagesRepository(database.db, { tenantId })
    const [otherUser] = await database.db
      .insert(portalUsers)
      .values({
        email: 'partner@company.ru',
        passwordHash: await hashPassword('Secret123'),
        tenantId,
      })
      .returning({
        id: portalUsers.id,
      })

    if (!otherUser) {
      throw new Error('Failed to create other portal user.')
    }

    const now = new Date('2026-04-21T12:00:00.000Z')
    const input = {
      clientMessageKey: 'portal-send:shared-key',
      messageKind: 'text',
      now,
      payloadSha256: 'payload-hash',
      primaryConversationId: 101,
      staleProcessingBefore: new Date('2026-04-21T11:58:00.000Z'),
    }

    await expect(
      repository.acquireSendLedgerEntry({
        ...input,
        processingToken: 'processing-token-1',
        userId,
      }),
    ).resolves.toMatchObject({
      outcome: 'acquired',
    })
    await expect(
      repository.acquireSendLedgerEntry({
        ...input,
        processingToken: 'processing-token-2',
        userId: otherUser.id,
      }),
    ).resolves.toMatchObject({
      outcome: 'acquired',
    })

    await repository.markSendLedgerEntryConfirmed({
      chatwootMessageId: 501,
      clientMessageKey: input.clientMessageKey,
      now,
      primaryConversationId: input.primaryConversationId,
      processingToken: 'processing-token-1',
      userId,
    })
    await repository.markSendLedgerEntryConfirmed({
      chatwootMessageId: 502,
      clientMessageKey: input.clientMessageKey,
      now,
      primaryConversationId: input.primaryConversationId,
      processingToken: 'processing-token-2',
      userId: otherUser.id,
    })

    await expect(
      repository.findSendLedgerEntry({
        clientMessageKey: input.clientMessageKey,
        primaryConversationId: input.primaryConversationId,
        userId,
      }),
    ).resolves.toMatchObject({
      chatwootMessageId: 501,
      status: 'confirmed',
    })
    await expect(
      repository.findSendLedgerEntry({
        clientMessageKey: input.clientMessageKey,
        primaryConversationId: input.primaryConversationId,
        userId: otherUser.id,
      }),
    ).resolves.toMatchObject({
      chatwootMessageId: 502,
      status: 'confirmed',
    })
  })

  it('allows the same send key scope in different tenants', async () => {
    const otherTenantId = (
      await seedTestTenant(database.db, {
        primaryDomain: 'other.localhost',
        slug: 'other',
      })
    ).id
    const [otherUser] = await database.db
      .insert(portalUsers)
      .values({
        email: 'name@other-company.ru',
        passwordHash: await hashPassword('Secret123'),
        tenantId: otherTenantId,
      })
      .returning({
        id: portalUsers.id,
      })

    if (!otherUser) {
      throw new Error('Failed to create other tenant test portal user.')
    }

    const tenantRepository = createChatMessagesRepository(database.db, {
      tenantId,
    })
    const otherTenantRepository = createChatMessagesRepository(database.db, {
      tenantId: otherTenantId,
    })
    const now = new Date('2026-04-21T12:00:00.000Z')
    const input = {
      clientMessageKey: 'portal-send:key-1',
      messageKind: 'text',
      now,
      payloadSha256: 'payload-hash',
      primaryConversationId: 101,
      staleProcessingBefore: new Date('2026-04-21T11:58:00.000Z'),
    }

    await expect(
      tenantRepository.acquireSendLedgerEntry({
        ...input,
        processingToken: 'processing-token-1',
        userId,
      }),
    ).resolves.toMatchObject({
      outcome: 'acquired',
    })
    await expect(
      otherTenantRepository.acquireSendLedgerEntry({
        ...input,
        processingToken: 'processing-token-2',
        userId: otherUser.id,
      }),
    ).resolves.toMatchObject({
      outcome: 'acquired',
    })
  })
})
