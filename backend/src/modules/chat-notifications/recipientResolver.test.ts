import { describe, expect, it, vi } from 'vitest'

import type { ChatwootContact } from '../../integrations/chatwoot/client.js'
import { createChatNotificationRecipientResolver } from './recipientResolver.js'

function personContact(id: number, groupContactIds: number[]) {
  return {
    customAttributes: {
      portal_client_group_contact_ids: groupContactIds.join(','),
      portal_enabled: true,
    },
    email: `user-${id}@example.test`,
    id,
    name: `User ${id}`,
    phoneNumber: null,
  } satisfies ChatwootContact
}

function groupContact(id: number, name: string | null = `Group ${id}`) {
  return {
    customAttributes: {
      portal_enabled: true,
      portal_is_group: true,
    },
    email: null,
    id,
    name,
    phoneNumber: null,
  } satisfies ChatwootContact
}

function createResolver({
  authorUserId = null,
  contacts = new Map<number, ChatwootContact | null>(),
  links = [
    {
      chatwootContactId: 101,
      email: 'one@example.test',
      fullName: 'One',
      userId: 1,
    },
    {
      chatwootContactId: 102,
      email: 'two@example.test',
      fullName: 'Two',
      userId: 2,
    },
  ],
}: {
  authorUserId?: number | null
  contacts?: Map<number, ChatwootContact | null>
  links?: Array<{
    chatwootContactId: number
    email: string
    fullName: string | null
    userId: number
  }>
} = {}) {
  return createChatNotificationRecipientResolver({
    chatThreadsRepository: {
      findSendLedgerAuthorsByMessageIds: vi.fn(async ({ messageIds }) => {
        if (authorUserId === null) {
          return new Map()
        }

        return new Map([
          [
            messageIds[0],
            {
              authorDisplayName: 'Author',
              userId: authorUserId,
            },
          ],
        ])
      }),
    },
    chatwootClient: {
      findContactById: vi.fn(
        async (contactId) => contacts.get(contactId) ?? null,
      ),
    },
    contactRepository: {
      findPortalUserById: vi.fn(async (userId) => ({
        email: `user-${userId}@example.test`,
        id: userId,
      })),
      listActivePortalUserContactLinks: vi.fn(async () => links),
    },
  })
}

describe('chat notification recipient resolver', () => {
  it('resolves the mapped private user', async () => {
    const resolver = createResolver()

    await expect(
      resolver.resolveRecipients({
        chatwootMessageId: 9001,
        threadMapping: {
          chatwootConversationId: 11,
          portalChatThreadId: 22,
          threadId: 'private:me',
          threadType: 'private',
          userId: 7,
        },
      }),
    ).resolves.toEqual([
      {
        portalChatThreadId: 22,
        portalUserId: 7,
        threadId: 'private:me',
        threadTitle: 'Личный чат',
        threadType: 'private',
      },
    ])
  })

  it('skips the private recipient when they authored the message', async () => {
    const resolver = createResolver({ authorUserId: 7 })

    await expect(
      resolver.resolveRecipients({
        chatwootMessageId: 9001,
        threadMapping: {
          chatwootConversationId: 11,
          portalChatThreadId: 22,
          threadId: 'private:me',
          threadType: 'private',
          userId: 7,
        },
      }),
    ).resolves.toEqual([])
  })

  it('skips the private recipient when the portal user is inactive', async () => {
    const resolver = createChatNotificationRecipientResolver({
      chatThreadsRepository: {
        findSendLedgerAuthorsByMessageIds: vi.fn(async () => new Map()),
      },
      chatwootClient: {
        findContactById: vi.fn(),
      },
      contactRepository: {
        findPortalUserById: vi.fn(async () => null),
        listActivePortalUserContactLinks: vi.fn(async () => []),
      },
    })

    await expect(
      resolver.resolveRecipients({
        chatwootMessageId: 9001,
        threadMapping: {
          chatwootConversationId: 11,
          portalChatThreadId: 22,
          threadId: 'private:me',
          threadType: 'private',
          userId: 7,
        },
      }),
    ).resolves.toEqual([])
  })

  it('resolves only current verified group members', async () => {
    const contacts = new Map<number, ChatwootContact | null>([
      [155, groupContact(155, 'ООО Уточки')],
      [101, personContact(101, [155])],
      [102, personContact(102, [999])],
      [103, null],
    ])
    const resolver = createResolver({
      contacts,
      links: [
        {
          chatwootContactId: 101,
          email: 'one@example.test',
          fullName: 'One',
          userId: 1,
        },
        {
          chatwootContactId: 102,
          email: 'two@example.test',
          fullName: 'Two',
          userId: 2,
        },
        {
          chatwootContactId: 103,
          email: 'three@example.test',
          fullName: 'Three',
          userId: 3,
        },
      ],
    })

    await expect(
      resolver.resolveRecipients({
        chatwootMessageId: 9001,
        threadMapping: {
          chatwootConversationId: 11,
          portalChatThreadId: 22,
          threadId: 'group:155',
          threadType: 'group',
          userId: null,
        },
      }),
    ).resolves.toEqual([
      {
        portalChatThreadId: 22,
        portalUserId: 1,
        threadId: 'group:155',
        threadTitle: 'ООО Уточки',
        threadType: 'group',
      },
    ])
  })

  it('skips group message author', async () => {
    const resolver = createResolver({
      authorUserId: 1,
      contacts: new Map<number, ChatwootContact | null>([
        [155, groupContact(155, 'ООО Уточки')],
        [101, personContact(101, [155])],
        [102, personContact(102, [155])],
      ]),
    })

    await expect(
      resolver.resolveRecipients({
        chatwootMessageId: 9001,
        threadMapping: {
          chatwootConversationId: 11,
          portalChatThreadId: 22,
          threadId: 'group:155',
          threadType: 'group',
          userId: null,
        },
      }),
    ).resolves.toEqual([
      {
        portalChatThreadId: 22,
        portalUserId: 2,
        threadId: 'group:155',
        threadTitle: 'ООО Уточки',
        threadType: 'group',
      },
    ])
  })

  it('keeps group push title generic when the group contact has no safe name', async () => {
    const resolver = createResolver({
      contacts: new Map<number, ChatwootContact | null>([
        [155, groupContact(155, null)],
        [101, personContact(101, [155])],
      ]),
      links: [
        {
          chatwootContactId: 101,
          email: 'one@example.test',
          fullName: 'One',
          userId: 1,
        },
      ],
    })

    await expect(
      resolver.resolveRecipients({
        chatwootMessageId: 9001,
        threadMapping: {
          chatwootConversationId: 11,
          portalChatThreadId: 22,
          threadId: 'group:155',
          threadType: 'group',
          userId: null,
        },
      }),
    ).resolves.toEqual([
      {
        portalChatThreadId: 22,
        portalUserId: 1,
        threadId: 'group:155',
        threadTitle: null,
        threadType: 'group',
      },
    ])
  })

  it('fails closed when group thread id cannot identify a group contact', async () => {
    const resolver = createResolver({
      contacts: new Map<number, ChatwootContact | null>([
        [101, personContact(101, [155])],
      ]),
    })

    await expect(
      resolver.resolveRecipients({
        chatwootMessageId: 9001,
        threadMapping: {
          chatwootConversationId: 11,
          portalChatThreadId: 22,
          threadId: 'group:not-a-number' as `group:${number}`,
          threadType: 'group',
          userId: null,
        },
      }),
    ).resolves.toEqual([])
  })
  it('rejects recipient overflow before external per-user calls and retries transient lookup failures', async () => {
    const findContactById = vi.fn(async (id: number) => {
      if (id === 154) return groupContact(154)
      throw new Error('temporary Chatwoot outage')
    })
    const listActivePortalUserContactLinks = vi.fn<
      (
        limit?: number,
      ) => Promise<
        Array<{ chatwootContactId: number; email: string; userId: number }>
      >
    >(async () => [
      { chatwootContactId: 101, email: 'one@example.test', userId: 1 },
      { chatwootContactId: 102, email: 'two@example.test', userId: 2 },
    ])
    const options = {
      chatThreadsRepository: {
        findSendLedgerAuthorsByMessageIds: vi.fn(async () => new Map()),
      },
      chatwootClient: { findContactById },
      contactRepository: {
        findPortalUserById: vi.fn(),
        listActivePortalUserContactLinks,
      },
      strict: true,
    }
    const input = {
      chatwootMessageId: 9001,
      threadMapping: {
        chatwootConversationId: 11,
        portalChatThreadId: 22,
        threadId: 'group:154' as const,
        threadType: 'group' as const,
        userId: null,
      },
    }
    await expect(
      createChatNotificationRecipientResolver({
        ...options,
        maxContactLinks: 1,
      }).resolveRecipients(input),
    ).rejects.toThrow('budget exceeded')
    expect(listActivePortalUserContactLinks).toHaveBeenCalledWith(2)
    expect(findContactById).toHaveBeenCalledTimes(1)
    await expect(
      createChatNotificationRecipientResolver({
        ...options,
        maxContactLinks: 2,
      }).resolveRecipients(input),
    ).rejects.toThrow('temporary Chatwoot outage')
  })
})
