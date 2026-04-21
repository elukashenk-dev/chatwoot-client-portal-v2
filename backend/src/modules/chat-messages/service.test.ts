import { describe, expect, it, vi } from 'vitest'

import { ChatwootInvalidHistoryCursorError } from '../../integrations/chatwoot/client.js'
import type { ChatContextSnapshot } from '../chat-context/service.js'
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

const sentChatwootMessage = {
  attachments: [],
  content: 'Portal text',
  contentAttributes: {},
  contentType: 'text',
  createdAt: 1_776_000_010,
  id: 501,
  messageType: 0,
  private: false,
  sender: {
    id: 44,
    name: 'Portal User',
    type: 'contact',
  },
  sourceId: 'portal-send:test-key',
  status: 'sent',
}

function createChatContextServiceStub({
  writableContext = readyContext,
}: {
  writableContext?: ChatContextSnapshot
} = {}) {
  return {
    ensureCurrentUserWritableChatContext: vi
      .fn()
      .mockResolvedValue(writableContext),
    getCurrentUserChatContext: vi.fn().mockResolvedValue(writableContext),
  }
}

function createChatwootClientStub(
  overrides: Partial<
    Parameters<typeof createChatMessagesService>[0]['chatwootClient']
  > = {},
): Parameters<typeof createChatMessagesService>[0]['chatwootClient'] {
  return {
    createConversationIncomingMessage: vi
      .fn()
      .mockResolvedValue(sentChatwootMessage),
    findConversationMessageById: vi.fn().mockResolvedValue(null),
    findConversationMessageBySourceId: vi.fn().mockResolvedValue(null),
    listConversationMessages: vi.fn(),
    ...overrides,
  }
}

function createChatMessagesRepositoryStub(
  overrides: Partial<
    NonNullable<
      Parameters<typeof createChatMessagesService>[0]['chatMessagesRepository']
    >
  > = {},
): NonNullable<
  Parameters<typeof createChatMessagesService>[0]['chatMessagesRepository']
> {
  return {
    acquireSendLedgerEntry: vi.fn().mockResolvedValue({
      entry: {
        attemptsCount: 1,
        chatwootMessageId: null,
        clientMessageKey: 'portal-send:test-key',
        confirmedAt: null,
        createdAt: new Date('2026-04-21T12:00:00.000Z'),
        failedAt: null,
        messageKind: 'text',
        payloadSha256: 'hash',
        primaryConversationId: 101,
        processingToken: 'processing-token',
        status: 'processing',
        updatedAt: new Date('2026-04-21T12:00:00.000Z'),
        userId: 7,
      },
      outcome: 'acquired',
    }),
    findSendLedgerEntry: vi.fn().mockResolvedValue(null),
    markSendLedgerEntryConfirmed: vi.fn().mockResolvedValue(null),
    markSendLedgerEntryFailed: vi.fn().mockResolvedValue(null),
    ...overrides,
  }
}

describe('createChatMessagesService', () => {
  it('returns controlled context without reading messages when chat is not ready', async () => {
    const chatwootClient = createChatwootClientStub({
      listConversationMessages: vi.fn(),
    })
    const service = createChatMessagesService({
      chatContextService: createChatContextServiceStub({
        writableContext: {
          linkedContact: null,
          primaryConversation: null,
          reason: 'contact_link_missing',
          result: 'not_ready',
        },
      }),
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
      chatContextService: createChatContextServiceStub(),
      chatwootClient: createChatwootClientStub({
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
      }),
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

  it('normalizes escaped Chatwoot line breaks before returning transcript content', async () => {
    const service = createChatMessagesService({
      chatContextService: createChatContextServiceStub(),
      chatwootClient: createChatwootClientStub({
        listConversationMessages: vi.fn().mockResolvedValue({
          hasMoreOlder: false,
          messages: [
            {
              attachments: [],
              content:
                'Первая строка\\nВторая строка\\r\\nТретья строка\\\nЧетвертая строка',
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
          ],
          nextOlderCursor: null,
        }),
      }),
    })

    await expect(
      service.getCurrentUserChatMessages({
        primaryConversationId: 101,
        userId: 7,
      }),
    ).resolves.toMatchObject({
      messages: [
        {
          content:
            'Первая строка\nВторая строка\nТретья строка\nЧетвертая строка',
          id: 21,
        },
      ],
      reason: 'none',
      result: 'ready',
    })
  })

  it('returns the public invalid_history_cursor error for stale history anchors', async () => {
    const service = createChatMessagesService({
      chatContextService: createChatContextServiceStub(),
      chatwootClient: createChatwootClientStub({
        listConversationMessages: vi
          .fn()
          .mockRejectedValue(new ChatwootInvalidHistoryCursorError()),
      }),
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

  it('sends text through the writable backend-owned conversation and confirms the ledger', async () => {
    const chatContextService = createChatContextServiceStub()
    const chatMessagesRepository = createChatMessagesRepositoryStub()
    const createConversationIncomingMessage = vi
      .fn()
      .mockResolvedValue(sentChatwootMessage)
    const service = createChatMessagesService({
      chatContextService,
      chatMessagesRepository,
      chatwootClient: createChatwootClientStub({
        createConversationIncomingMessage,
      }),
      now: () => new Date('2026-04-21T12:00:00.000Z'),
    })

    await expect(
      service.sendCurrentUserTextMessage({
        clientMessageKey: 'portal-send:test-key',
        content: ' Portal text ',
        primaryConversationId: 101,
        userId: 7,
      }),
    ).resolves.toMatchObject({
      reason: 'none',
      result: 'ready',
      sentMessage: {
        authorName: 'Вы',
        content: 'Portal text',
        direction: 'outgoing',
        id: 501,
      },
    })
    expect(
      chatContextService.ensureCurrentUserWritableChatContext,
    ).toHaveBeenCalledWith({
      selectedPrimaryConversationId: 101,
      userId: 7,
    })
    expect(createConversationIncomingMessage).toHaveBeenCalledWith({
      content: 'Portal text',
      conversationId: 101,
      sourceId: 'portal-send:test-key',
    })
    expect(
      chatMessagesRepository.markSendLedgerEntryConfirmed,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        chatwootMessageId: 501,
        clientMessageKey: 'portal-send:test-key',
        primaryConversationId: 101,
        userId: 7,
      }),
    )
  })

  it('replays a confirmed ledger entry by exact Chatwoot message id without duplicate send', async () => {
    const createConversationIncomingMessage = vi.fn()
    const service = createChatMessagesService({
      chatContextService: createChatContextServiceStub(),
      chatMessagesRepository: createChatMessagesRepositoryStub({
        acquireSendLedgerEntry: vi.fn().mockResolvedValue({
          entry: {
            attemptsCount: 1,
            chatwootMessageId: 501,
            clientMessageKey: 'portal-send:test-key',
            confirmedAt: new Date('2026-04-21T12:00:00.000Z'),
            createdAt: new Date('2026-04-21T12:00:00.000Z'),
            failedAt: null,
            messageKind: 'text',
            payloadSha256: 'hash',
            primaryConversationId: 101,
            processingToken: null,
            status: 'confirmed',
            updatedAt: new Date('2026-04-21T12:00:00.000Z'),
            userId: 7,
          },
          outcome: 'confirmed',
        }),
      }),
      chatwootClient: createChatwootClientStub({
        createConversationIncomingMessage,
        findConversationMessageById: vi
          .fn()
          .mockResolvedValue(sentChatwootMessage),
      }),
    })

    await expect(
      service.sendCurrentUserTextMessage({
        clientMessageKey: 'portal-send:test-key',
        content: 'Portal text',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      sentMessage: {
        id: 501,
      },
    })
    expect(createConversationIncomingMessage).not.toHaveBeenCalled()
  })

  it('recovers a false-negative send by source id and confirms the ledger', async () => {
    const chatMessagesRepository = createChatMessagesRepositoryStub()
    const findConversationMessageBySourceId = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(sentChatwootMessage)
    const service = createChatMessagesService({
      chatContextService: createChatContextServiceStub(),
      chatMessagesRepository,
      chatwootClient: createChatwootClientStub({
        createConversationIncomingMessage: vi
          .fn()
          .mockRejectedValue(new Error('network closed after create')),
        findConversationMessageBySourceId,
      }),
    })

    await expect(
      service.sendCurrentUserTextMessage({
        clientMessageKey: 'portal-send:test-key',
        content: 'Portal text',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      sentMessage: {
        id: 501,
      },
    })
    expect(findConversationMessageBySourceId).toHaveBeenCalledTimes(2)
    expect(
      chatMessagesRepository.markSendLedgerEntryConfirmed,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        chatwootMessageId: 501,
      }),
    )
    expect(
      chatMessagesRepository.markSendLedgerEntryFailed,
    ).not.toHaveBeenCalled()
  })
})
