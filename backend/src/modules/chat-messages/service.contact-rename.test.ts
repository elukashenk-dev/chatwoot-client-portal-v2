import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DatabaseClient } from '../../db/client.js'
import {
  portalChatMessageSends,
  portalChatThreads,
  portalUserContactLinks,
  portalUsers,
} from '../../db/schema.js'
import type {
  ChatwootContact,
  ChatwootMessage,
} from '../../integrations/chatwoot/client.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import { seedTestTenant } from '../../test/testTenants.js'
import { createChatThreadContactRepository } from '../chat-threads/contactRepository.js'
import { createChatThreadsRepository } from '../chat-threads/repository.js'
import { createChatThreadsService } from '../chat-threads/service.js'
import { createProfileService } from '../profile/service.js'
import { createChatMessagesRepository } from './repository.js'
import { createChatMessagesService } from './service.js'
import { sentAttachmentChatwootMessage } from './service.testSupport.js'

// Real portal persistence and services; only the external Chatwoot boundary is a double.
describe('contact rename across profile, participants and historical messages', () => {
  let database: DatabaseClient
  beforeEach(async () => {
    database = await createTestDatabase()
  })
  afterEach(async () => {
    await database.close()
  })
  it.each(['text', 'attachment'] as const)(
    'keeps historical %s authors while new sends use the current contact',
    async (kind) => {
      const { db } = database
      const { id: tenantId } = await seedTestTenant(db)
      const [user] = await db
        .insert(portalUsers)
        .values({
          tenantId,
          email: 'office@example.test',
          fullName: 'Иван Петров',
        })
        .returning()
      const [viewer] = await db
        .insert(portalUsers)
        .values({
          tenantId,
          email: 'viewer@example.test',
          fullName: 'Viewer',
        })
        .returning()
      await db.insert(portalUserContactLinks).values([
        { tenantId, userId: user!.id, chatwootContactId: 44 },
        { tenantId, userId: viewer!.id, chatwootContactId: 55 },
      ])
      const [thread] = await db
        .insert(portalChatThreads)
        .values({
          tenantId,
          threadType: 'group',
          chatwootContactId: 154,
          chatwootInboxId: 9,
          chatwootConversationId: 301,
        })
        .returning()
      const person: ChatwootContact = {
        id: 44,
        email: user!.email,
        name: 'Иван Петров',
        phoneNumber: '+79001111111',
        customAttributes: {
          portal_enabled: true,
          portal_client_group_contact_ids: '154',
        },
      }
      const contacts = new Map<number, ChatwootContact>([
        [44, person],
        [55, { ...person, id: 55, name: 'Viewer', email: viewer!.email }],
        [
          154,
          {
            id: 154,
            name: 'Group',
            email: null,
            phoneNumber: null,
            customAttributes: { portal_enabled: true, portal_is_group: true },
          },
        ],
      ])
      const messages: ChatwootMessage[] = []
      const createMessage = vi.fn(
        async (input: {
          content?: string | null
          sourceId?: string | null
          replyToMessageId?: number | null
        }) => {
          const id = 501 + messages.length
          const message: ChatwootMessage = {
            ...sentAttachmentChatwootMessage,
            id,
            content: input.content ?? null,
            contentAttributes: { in_reply_to: input.replyToMessageId },
            sourceId: input.sourceId ?? null,
            sender: { id: 154, name: 'Group', type: 'contact' },
            attachments:
              kind === 'text'
                ? []
                : sentAttachmentChatwootMessage.attachments.map(
                    (attachment) => ({ ...attachment, messageId: id }),
                  ),
          }
          messages.push(message)
          return message
        },
      )
      const client = {
        findContactById: vi.fn(async (id: number) => contacts.get(id) ?? null),
        findContactByEmail: vi.fn(),
        createContactInbox: vi.fn(),
        createConversation: vi.fn(),
        findContactPortalInboxSourceId: vi.fn(),
        listContactConversations: vi.fn(async () => []),
        createConversationIncomingMessage: createMessage,
        createConversationIncomingAttachmentMessage: createMessage,
        findConversationMessageById: vi.fn(
          async (_conversationId: number, id: number) =>
            messages.find((message) => message.id === id) ?? null,
        ),
        findConversationMessageBySourceId: vi.fn(
          async (_conversationId: number, sourceId: string) =>
            messages.find((message) => message.sourceId === sourceId) ?? null,
        ),
        listConversationMessages: vi.fn(async () => ({
          messages: [...messages],
          hasMoreOlder: false,
          nextOlderCursor: null,
        })),
        listConversationMessagesAfter: vi.fn(),
      }
      const contactRepository = createChatThreadContactRepository(db, {
        tenantId,
      })
      const chatThreadsRepository = createChatThreadsRepository(db, {
        tenantId,
      })
      const chatThreadsService = createChatThreadsService({
        contactRepository,
        chatThreadsRepository,
        chatwootClient: client,
        portalInboxId: 9,
      })
      const profileService = createProfileService({
        contactRepository,
        chatwootClient: client,
        fetchAllowedAttachment: vi.fn(),
      })
      const service = createChatMessagesService({
        chatThreadsRepository,
        chatThreadsService,
        chatwootClient: client,
        chatMessagesRepository: createChatMessagesRepository(db, {
          tenantId,
        }),
      })
      const send = (
        clientMessageKey: string,
        replyToMessageId: number | null = null,
      ) => {
        const input = {
          userId: user!.id,
          threadId: 'group:154',
          clientMessageKey,
          content: 'Документы готовы',
          replyToMessageId,
        }
        return kind === 'text'
          ? service.sendCurrentUserTextMessage(input)
          : service.sendCurrentUserAttachmentMessage({
              ...input,
              attachments: [
                {
                  data: Buffer.from('pdf'),
                  fileName: 'report.pdf',
                  mimeType: 'application/pdf',
                  size: 3,
                },
              ],
            })
      }
      const oldSend = await send('old-message')
      expect(oldSend.sentMessage?.authorName).toBe('Вы')
      person.name = 'Анна Сидорова'
      person.phoneNumber = '+79002222222'
      expect(
        await profileService.getCurrentUserProfile({
          user: { ...user!, passwordConfigured: false },
        }),
      ).toMatchObject({
        fullName: 'Анна Сидорова',
        phoneNumber: '+79002222222',
        email: 'office@example.test',
      })
      expect(
        await chatThreadsService.getCurrentUserThreadInfo({
          userId: viewer!.id,
          threadId: 'group:154',
        }),
      ).toMatchObject({
        participants: expect.arrayContaining([
          {
            avatarUrl: null,
            displayName: 'Анна Сидорова',
            id: `portal-user:${user!.id}`,
            isCurrentUser: false,
          },
        ]),
      })
      await send('new-message', 501)
      // Same-key retry under the current name must not create another message.
      await send('new-message', 501)
      expect(createMessage).toHaveBeenCalledTimes(2)
      expect(messages.map((message) => message.content)).toEqual([
        '**Иван Петров**\nДокументы готовы',
        '**Анна Сидорова**\nДокументы готовы',
      ])
      const snapshot = await service.getCurrentUserChatMessages({
        userId: viewer!.id,
        threadId: 'group:154',
      })
      expect(snapshot.messages.map((message) => message.authorName)).toEqual([
        'Иван Петров',
        'Анна Сидорова',
      ])
      expect(snapshot.messages[1]?.replyTo?.authorName).toBe('Иван Петров')
      const ledger =
        await chatThreadsRepository.findSendLedgerAuthorsByMessageIds({
          portalChatThreadId: thread!.id,
          messageIds: [501, 502],
        })
      expect(
        [...ledger.values()].map((author) => author.authorDisplayName),
      ).toEqual(['Иван Петров', 'Анна Сидорова'])
      // Existing limitation: rename changes the send hash; replay rejects without rewriting history.
      await expect(send('old-message')).rejects.toMatchObject({
        code: 'client_message_key_conflict',
      })
      expect(createMessage).toHaveBeenCalledTimes(2)
      // Ledger retention must not make old messages adopt the current contact name.
      await db
        .delete(portalChatMessageSends)
        .where(eq(portalChatMessageSends.tenantId, tenantId))
      const retained = await service.getCurrentUserChatMessages({
        userId: viewer!.id,
        threadId: 'group:154',
      })
      expect(retained.messages.map((message) => message.authorName)).toEqual([
        'Иван Петров',
        'Анна Сидорова',
      ])
      expect(retained.messages[1]?.replyTo?.authorName).toBe('Иван Петров')
    },
  )
})
