import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { DatabaseClient } from '../../db/client.js'
import { portalUsers } from '../../db/schema.js'
import { hashPassword } from '../../lib/password.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import { createChatMessagesRepository } from './repository.js'

describe('createChatMessagesRepository', () => {
  let database: DatabaseClient
  let userId: number

  beforeEach(async () => {
    database = await createTestDatabase()
    const [user] = await database.db
      .insert(portalUsers)
      .values({
        email: 'name@company.ru',
        passwordHash: await hashPassword('Secret123'),
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
    const repository = createChatMessagesRepository(database.db)
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
    const repository = createChatMessagesRepository(database.db)
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
})
