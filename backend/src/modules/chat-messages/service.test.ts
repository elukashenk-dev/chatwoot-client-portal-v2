import { describe, expect, it, vi } from 'vitest'

import { ChatwootInvalidHistoryCursorError } from '../../integrations/chatwoot/client.js'
import { createChatMessagesService } from './service.js'

const readyContext = {
  linkedContact: {
    id: 44,
  },
  primaryConversation: {
    assigneeName: 'Анна Смирнова',
    id: 101,
    inboxId: 9,
    lastActivityAt: 300,
    status: 'open',
  },
  reason: 'none' as const,
  result: 'ready' as const,
}

describe('createChatMessagesService', () => {
  it('returns controlled context without reading messages when chat is not ready', async () => {
    const chatwootClient = {
      listConversationMessages: vi.fn(),
    }
    const service = createChatMessagesService({
      chatContextService: {
        getCurrentUserChatContext: vi.fn().mockResolvedValue({
          linkedContact: null,
          primaryConversation: null,
          reason: 'contact_link_missing',
          result: 'not_ready',
        }),
      },
      chatwootClient,
    })

    await expect(
      service.getCurrentUserChatMessages({ userId: 7 }),
    ).resolves.toMatchObject({
      hasMoreOlder: false,
      messages: [],
      nextOlderCursor: null,
      reason: 'contact_link_missing',
      result: 'not_ready',
    })
    expect(chatwootClient.listConversationMessages).not.toHaveBeenCalled()
  })

  it('maps Chatwoot messages into the portal transcript contract', async () => {
    const service = createChatMessagesService({
      chatContextService: {
        getCurrentUserChatContext: vi.fn().mockResolvedValue(readyContext),
      },
      chatwootClient: {
        listConversationMessages: vi.fn().mockResolvedValue({
          hasMoreOlder: true,
          messages: [
            {
              attachments: [],
              content: 'Agent reply',
              contentAttributes: {},
              contentType: 'text',
              createdAt: 1_776_000_001,
              id: 21,
              messageType: 1,
              private: false,
              sender: {
                id: 5,
                name: 'Анна Смирнова',
                type: 'user',
              },
              sourceId: null,
              status: 'sent',
            },
            {
              attachments: [
                {
                  extension: 'pdf',
                  fileSize: 1024,
                  fileType: 'file',
                  id: 8,
                  messageId: 22,
                  name: 'invoice.pdf',
                  thumbUrl: '',
                  url: 'https://files.example.test/invoice.pdf',
                },
              ],
              content: 'Portal message',
              contentAttributes: {},
              contentType: 'text',
              createdAt: 1_776_000_002,
              id: 22,
              messageType: 0,
              private: false,
              sender: {
                id: 7,
                name: 'Portal User',
                type: 'contact',
              },
              sourceId: null,
              status: 'sent',
            },
          ],
          nextOlderCursor: 21,
        }),
      },
    })

    await expect(
      service.getCurrentUserChatMessages({
        beforeMessageId: 21,
        primaryConversationId: 101,
        userId: 7,
      }),
    ).resolves.toMatchObject({
      hasMoreOlder: true,
      messages: [
        {
          authorName: 'Анна Смирнова',
          content: 'Agent reply',
          direction: 'incoming',
          id: 21,
        },
        {
          attachments: [
            {
              name: 'invoice.pdf',
              url: 'https://files.example.test/invoice.pdf',
            },
          ],
          authorName: 'Вы',
          content: 'Portal message',
          direction: 'outgoing',
          id: 22,
        },
      ],
      nextOlderCursor: 21,
      reason: 'none',
      result: 'ready',
    })
  })

  it('returns the public invalid_history_cursor error for stale history anchors', async () => {
    const service = createChatMessagesService({
      chatContextService: {
        getCurrentUserChatContext: vi.fn().mockResolvedValue(readyContext),
      },
      chatwootClient: {
        listConversationMessages: vi
          .fn()
          .mockRejectedValue(new ChatwootInvalidHistoryCursorError()),
      },
    })

    await expect(
      service.getCurrentUserChatMessages({
        beforeMessageId: 999,
        primaryConversationId: 101,
        userId: 7,
      }),
    ).rejects.toMatchObject({
      code: 'invalid_history_cursor',
      statusCode: 400,
    })
  })
})
