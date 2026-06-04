import { describe, expect, it, vi } from 'vitest'

import { ChatwootInvalidHistoryCursorError } from '../../integrations/chatwoot/client.js'
import type { CurrentUserChatThreadContext } from '../chat-threads/types.js'
import { createChatMessagesService } from './service.js'
import {
  createChatMessagesRepositoryStub,
  createChatThreadsRepositoryStub,
  createChatThreadsServiceStub,
  createChatwootClientStub,
  sentAttachmentChatwootMessage,
  sentAudioChatwootMessage,
  sentChatwootMessage,
  type ClearOpenedThreadUnread,
} from './service.testSupport.js'

describe('createChatMessagesService', () => {
  it('returns controlled context without reading messages when chat is not ready', async () => {
    const chatwootClient = createChatwootClientStub({
      listConversationMessages: vi.fn(),
    })
    const service = createChatMessagesService({
      chatThreadsRepository: createChatThreadsRepositoryStub(),
      chatThreadsService: createChatThreadsServiceStub({
        context: {
          activeThread: null,
          chatwootContactSourceId: null,
          chatwootConversation: null,
          currentUserEmail: null,
          currentUserName: null,
          linkedContactId: null,
          portalChatThreadId: null,
          reason: 'contact_link_missing',
          result: 'not_ready',
          targetChatwootContactId: null,
          threadType: null,
        } as CurrentUserChatThreadContext,
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

  it('returns controlled context for unavailable group thread ids', async () => {
    const chatThreadsService = createChatThreadsServiceStub({
      context: {
        activeThread: null,
        chatwootContactSourceId: null,
        chatwootConversation: null,
        currentUserEmail: 'user@example.test',
        currentUserName: 'Portal User',
        linkedContactId: 44,
        portalChatThreadId: null,
        reason: 'thread_access_denied',
        result: 'not_ready',
        targetChatwootContactId: 154,
        threadType: 'group',
      },
    })
    const service = createChatMessagesService({
      chatThreadsRepository: createChatThreadsRepositoryStub(),
      chatThreadsService,
      chatwootClient: createChatwootClientStub(),
    })

    await expect(
      service.getCurrentUserChatMessages({
        threadId: 'group:154',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      messages: [],
      reason: 'thread_access_denied',
      result: 'not_ready',
    })
    expect(chatThreadsService.getCurrentUserThreadContext).toHaveBeenCalledWith(
      {
        threadId: 'group:154',
        userId: 7,
      },
    )
  })

  it('maps Chatwoot messages into the portal transcript contract', async () => {
    const service = createChatMessagesService({
      chatThreadsRepository: createChatThreadsRepositoryStub(),
      chatThreadsService: createChatThreadsServiceStub(),
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
                avatarUrl: 'https://chatwoot.example.test/agent-avatar.png',
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
              contentAttributes: {
                in_reply_to: 21,
              },
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
        threadId: 'private:me',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      hasMoreOlder: true,
      messages: [
        {
          authorAvatarUrl: '/api/chat/threads/private%3Ame/messages/21/avatar',
          authorName: 'Анна Смирнова',
          content: 'Agent reply',
          direction: 'incoming',
          id: 21,
        },
        {
          attachments: [
            {
              name: 'invoice.pdf',
              url: '/api/chat/threads/private%3Ame/attachments/22/8',
            },
          ],
          authorName: 'Вы',
          content: 'Portal message',
          direction: 'outgoing',
          id: 22,
          replyTo: {
            attachmentName: null,
            authorName: 'Анна Смирнова',
            content: 'Agent reply',
            direction: 'incoming',
            messageId: 21,
          },
        },
      ],
      nextOlderCursor: 21,
      reason: 'none',
      result: 'ready',
    })
  })

  it('clears unread after a successful latest snapshot', async () => {
    const chatThreadsService = createChatThreadsServiceStub()
    const clearOpenedThreadUnread = vi
      .fn<ClearOpenedThreadUnread>()
      .mockResolvedValue({
        clearedThreadId: 'private:me',
        totalUnreadCount: 3,
      })
    const service = createChatMessagesService({
      chatThreadsRepository: createChatThreadsRepositoryStub(),
      chatThreadsService,
      chatUnreadService: {
        clearOpenedThreadUnread,
      },
      chatwootClient: createChatwootClientStub({
        listConversationMessages: vi.fn().mockResolvedValue({
          hasMoreOlder: false,
          messages: [],
          nextOlderCursor: null,
        }),
      }),
    })

    await expect(
      service.getCurrentUserChatMessages({
        threadId: 'private:me',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      unread: {
        clearedThreadId: 'private:me',
        totalUnreadCount: 3,
      },
    })
    expect(clearOpenedThreadUnread).toHaveBeenCalledWith({
      portalUserId: 7,
      threadId: 'private:me',
      visibleThreadIds: ['private:me'],
    })
    expect(chatThreadsService.listCurrentUserThreads).toHaveBeenCalledWith({
      userId: 7,
    })
    const listThreadsCallOrder =
      chatThreadsService.listCurrentUserThreads.mock.invocationCallOrder[0]
    const clearUnreadCallOrder =
      clearOpenedThreadUnread.mock.invocationCallOrder[0]

    expect(listThreadsCallOrder).toBeDefined()
    expect(clearUnreadCallOrder).toBeDefined()
    expect(listThreadsCallOrder!).toBeLessThan(clearUnreadCallOrder!)
  })

  it('does not clear unread for older message pagination', async () => {
    const clearOpenedThreadUnread = vi.fn<ClearOpenedThreadUnread>()
    const service = createChatMessagesService({
      chatThreadsRepository: createChatThreadsRepositoryStub(),
      chatThreadsService: createChatThreadsServiceStub(),
      chatUnreadService: {
        clearOpenedThreadUnread,
      },
      chatwootClient: createChatwootClientStub({
        listConversationMessages: vi.fn().mockResolvedValue({
          hasMoreOlder: false,
          messages: [],
          nextOlderCursor: null,
        }),
      }),
    })

    await service.getCurrentUserChatMessages({
      beforeMessageId: 205,
      threadId: 'private:me',
      userId: 7,
    })

    expect(clearOpenedThreadUnread).not.toHaveBeenCalled()
  })

  it('does not clear unread when the snapshot is not ready', async () => {
    const clearOpenedThreadUnread = vi.fn<ClearOpenedThreadUnread>()
    const service = createChatMessagesService({
      chatThreadsRepository: createChatThreadsRepositoryStub(),
      chatThreadsService: createChatThreadsServiceStub({
        context: {
          activeThread: null,
          chatwootContactSourceId: null,
          chatwootConversation: null,
          currentUserEmail: null,
          currentUserName: null,
          linkedContactId: null,
          portalChatThreadId: null,
          reason: 'thread_access_denied',
          result: 'not_ready',
          targetChatwootContactId: null,
          threadType: null,
        },
      }),
      chatUnreadService: {
        clearOpenedThreadUnread,
      },
      chatwootClient: createChatwootClientStub(),
    })

    await service.getCurrentUserChatMessages({
      threadId: 'group:154',
      userId: 7,
    })

    expect(clearOpenedThreadUnread).not.toHaveBeenCalled()
  })

  it('fails closed when unread clear fails after a successful snapshot', async () => {
    const clearOpenedThreadUnread = vi
      .fn<ClearOpenedThreadUnread>()
      .mockRejectedValue(new Error('clear failed'))
    const service = createChatMessagesService({
      chatThreadsRepository: createChatThreadsRepositoryStub(),
      chatThreadsService: createChatThreadsServiceStub(),
      chatUnreadService: {
        clearOpenedThreadUnread,
      },
      chatwootClient: createChatwootClientStub({
        listConversationMessages: vi.fn().mockResolvedValue({
          hasMoreOlder: false,
          messages: [],
          nextOlderCursor: null,
        }),
      }),
    })

    await expect(
      service.getCurrentUserChatMessages({
        threadId: 'private:me',
        userId: 7,
      }),
    ).rejects.toThrow('clear failed')
  })

  it('fetches a missing reply target and exposes a safe reply preview', async () => {
    const findConversationMessageById = vi.fn().mockResolvedValue({
      attachments: [],
      content: 'Старый вопрос клиента',
      contentAttributes: {},
      contentType: 'text',
      createdAt: 1_776_000_000,
      id: 18,
      messageType: 0,
      private: false,
      sender: {
        id: 44,
        name: 'Portal User',
        type: 'contact',
      },
      sourceId: null,
      status: 'sent',
    })
    const service = createChatMessagesService({
      chatThreadsRepository: createChatThreadsRepositoryStub(),
      chatThreadsService: createChatThreadsServiceStub(),
      chatwootClient: createChatwootClientStub({
        findConversationMessageById,
        listConversationMessages: vi.fn().mockResolvedValue({
          hasMoreOlder: false,
          messages: [
            {
              attachments: [],
              content: 'Ответ на старый вопрос',
              contentAttributes: {
                in_reply_to: 18,
              },
              contentType: 'text',
              createdAt: 1_776_000_010,
              id: 25,
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
        threadId: 'private:me',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      messages: [
        {
          id: 25,
          replyTo: {
            authorName: 'Вы',
            content: 'Старый вопрос клиента',
            direction: 'outgoing',
            messageId: 18,
          },
        },
      ],
    })
    expect(findConversationMessageById).toHaveBeenCalledWith(101, 18)
  })

  it('normalizes escaped Chatwoot line breaks before returning transcript content', async () => {
    const service = createChatMessagesService({
      chatThreadsRepository: createChatThreadsRepositoryStub(),
      chatThreadsService: createChatThreadsServiceStub(),
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
        threadId: 'private:me',
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
      chatThreadsRepository: createChatThreadsRepositoryStub(),
      chatThreadsService: createChatThreadsServiceStub(),
      chatwootClient: createChatwootClientStub({
        listConversationMessages: vi
          .fn()
          .mockRejectedValue(new ChatwootInvalidHistoryCursorError()),
      }),
    })

    await expect(
      service.getCurrentUserChatMessages({
        beforeMessageId: 999,
        threadId: 'private:me',
        userId: 7,
      }),
    ).rejects.toMatchObject({
      code: 'invalid_history_cursor',
      statusCode: 400,
    })
  })

  it('sends text through the writable backend-owned conversation and confirms the ledger', async () => {
    const chatThreadsService = createChatThreadsServiceStub()
    const chatMessagesRepository = createChatMessagesRepositoryStub()
    const createConversationIncomingMessage = vi
      .fn()
      .mockResolvedValue(sentChatwootMessage)
    const service = createChatMessagesService({
      chatThreadsRepository: createChatThreadsRepositoryStub(),
      chatThreadsService,
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
        threadId: 'private:me',
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
      chatThreadsService.ensureCurrentUserWritableThreadContext,
    ).toHaveBeenCalledWith({
      threadId: 'private:me',
      userId: 7,
    })
    expect(createConversationIncomingMessage).toHaveBeenCalledWith({
      content: 'Portal text',
      conversationId: 101,
      replyToMessageId: null,
      sourceId: 'portal-send:test-key',
    })
    expect(
      chatMessagesRepository.markSendLedgerEntryConfirmed,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        chatwootMessageId: 501,
        clientMessageKey: 'portal-send:test-key',
        portalChatThreadId: 1,
        userId: 7,
      }),
    )
  })

  it('sends text replies with Chatwoot reply metadata and reply preview', async () => {
    const repliedChatwootMessage = {
      ...sentChatwootMessage,
      contentAttributes: {
        in_reply_to: 21,
      },
    }
    const replyTargetChatwootMessage = {
      attachments: [],
      content: 'Agent question',
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
    }
    const createConversationIncomingMessage = vi
      .fn()
      .mockResolvedValue(repliedChatwootMessage)
    const findConversationMessageById = vi
      .fn()
      .mockResolvedValue(replyTargetChatwootMessage)
    const service = createChatMessagesService({
      chatThreadsRepository: createChatThreadsRepositoryStub(),
      chatThreadsService: createChatThreadsServiceStub(),
      chatMessagesRepository: createChatMessagesRepositoryStub(),
      chatwootClient: createChatwootClientStub({
        createConversationIncomingMessage,
        findConversationMessageById,
      }),
      now: () => new Date('2026-04-21T12:00:00.000Z'),
    })

    await expect(
      service.sendCurrentUserTextMessage({
        clientMessageKey: 'portal-send:test-key',
        content: 'Portal text',
        replyToMessageId: 21,
        threadId: 'private:me',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      sentMessage: {
        id: 501,
        replyTo: {
          authorName: 'Анна Смирнова',
          content: 'Agent question',
          direction: 'incoming',
          messageId: 21,
        },
      },
    })
    expect(createConversationIncomingMessage).toHaveBeenCalledWith({
      content: 'Portal text',
      conversationId: 101,
      replyToMessageId: 21,
      sourceId: 'portal-send:test-key',
    })
    expect(findConversationMessageById).toHaveBeenCalledWith(101, 21)
  })

  it('rejects text replies when the target message is unavailable', async () => {
    const createConversationIncomingMessage = vi.fn()
    const service = createChatMessagesService({
      chatThreadsRepository: createChatThreadsRepositoryStub(),
      chatThreadsService: createChatThreadsServiceStub(),
      chatMessagesRepository: createChatMessagesRepositoryStub(),
      chatwootClient: createChatwootClientStub({
        createConversationIncomingMessage,
        findConversationMessageById: vi.fn().mockResolvedValue(null),
      }),
    })

    await expect(
      service.sendCurrentUserTextMessage({
        clientMessageKey: 'portal-send:test-key',
        content: 'Portal text',
        replyToMessageId: 999,
        threadId: 'private:me',
        userId: 7,
      }),
    ).rejects.toMatchObject({
      code: 'reply_target_unavailable',
      statusCode: 400,
    })
    expect(createConversationIncomingMessage).not.toHaveBeenCalled()
  })

  it('replays a confirmed ledger entry by exact Chatwoot message id without duplicate send', async () => {
    const createConversationIncomingMessage = vi.fn()
    const service = createChatMessagesService({
      chatThreadsRepository: createChatThreadsRepositoryStub(),
      chatThreadsService: createChatThreadsServiceStub(),
      chatMessagesRepository: createChatMessagesRepositoryStub({
        acquireSendLedgerEntry: vi.fn().mockResolvedValue({
          entry: {
            attemptsCount: 1,
            authorDisplayNameSnapshot: 'Portal User',
            chatwootMessageId: 501,
            clientMessageKey: 'portal-send:test-key',
            confirmedAt: new Date('2026-04-21T12:00:00.000Z'),
            createdAt: new Date('2026-04-21T12:00:00.000Z'),
            failedAt: null,
            messageKind: 'text',
            payloadSha256: 'hash',
            portalChatThreadId: 1,
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
        threadId: 'private:me',
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
      chatThreadsRepository: createChatThreadsRepositoryStub(),
      chatThreadsService: createChatThreadsServiceStub(),
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
        threadId: 'private:me',
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

  it('sends an attachment through the writable conversation and confirms the ledger', async () => {
    const chatMessagesRepository = createChatMessagesRepositoryStub()
    const createConversationIncomingAttachmentMessage = vi
      .fn()
      .mockResolvedValue({
        ...sentAttachmentChatwootMessage,
        content: 'Подпись к файлу',
      })
    const service = createChatMessagesService({
      chatThreadsRepository: createChatThreadsRepositoryStub(),
      chatThreadsService: createChatThreadsServiceStub(),
      chatMessagesRepository,
      chatwootClient: createChatwootClientStub({
        createConversationIncomingAttachmentMessage,
      }),
      now: () => new Date('2026-04-21T12:00:00.000Z'),
    })
    const data = Buffer.from('%PDF-1.7\n')

    await expect(
      service.sendCurrentUserAttachmentMessage({
        attachment: {
          data,
          fileName: ' invoice.pdf ',
          mimeType: 'Application/PDF',
          size: data.byteLength,
        },
        clientMessageKey: 'portal-send:attachment-key',
        content: ' Подпись к файлу ',
        threadId: 'private:me',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      reason: 'none',
      result: 'ready',
      sentMessage: {
        attachments: [
          {
            name: 'invoice.pdf',
            url: '/api/chat/threads/private%3Ame/attachments/601/77',
          },
        ],
        authorName: 'Вы',
        content: 'Подпись к файлу',
        direction: 'outgoing',
        id: 601,
      },
    })

    const createArgs =
      createConversationIncomingAttachmentMessage.mock.calls[0]?.[0]

    expect(createArgs).toMatchObject({
      attachment: {
        fileName: 'invoice.pdf',
        mimeType: 'application/pdf',
        size: data.byteLength,
      },
      content: 'Подпись к файлу',
      sourceId: 'portal-send:attachment-key',
    })
    expect(
      Buffer.compare(createArgs?.attachment.data ?? Buffer.alloc(0), data),
    ).toBe(0)
    expect(chatMessagesRepository.acquireSendLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        clientMessageKey: 'portal-send:attachment-key',
        messageKind: 'attachment',
        payloadSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        portalChatThreadId: 1,
        userId: 7,
      }),
    )
    expect(
      chatMessagesRepository.markSendLedgerEntryConfirmed,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        chatwootMessageId: 601,
        clientMessageKey: 'portal-send:attachment-key',
        portalChatThreadId: 1,
        userId: 7,
      }),
    )
  })

  it('accepts recorded audio attachments through the same send authority', async () => {
    const createConversationIncomingAttachmentMessage = vi
      .fn()
      .mockResolvedValue(sentAudioChatwootMessage)
    const service = createChatMessagesService({
      chatThreadsRepository: createChatThreadsRepositoryStub(),
      chatThreadsService: createChatThreadsServiceStub(),
      chatMessagesRepository: createChatMessagesRepositoryStub(),
      chatwootClient: createChatwootClientStub({
        createConversationIncomingAttachmentMessage,
      }),
    })
    const data = Buffer.from('webm voice bytes')

    await expect(
      service.sendCurrentUserAttachmentMessage({
        attachment: {
          data,
          fileName: 'voice-message.webm',
          mimeType: 'audio/webm;codecs=opus',
          size: data.byteLength,
        },
        clientMessageKey: 'portal-send:voice-key',
        threadId: 'private:me',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      result: 'ready',
      sentMessage: {
        attachments: [
          {
            fileType: 'audio',
            name: 'voice-message.webm',
          },
        ],
        id: 602,
      },
    })

    expect(createConversationIncomingAttachmentMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        attachment: expect.objectContaining({
          fileName: 'voice-message.webm',
          mimeType: 'audio/webm;codecs=opus',
          size: data.byteLength,
        }),
        sourceId: 'portal-send:voice-key',
      }),
    )
  })

  it('rejects unsupported attachment types before calling Chatwoot', async () => {
    const createConversationIncomingAttachmentMessage = vi.fn()
    const service = createChatMessagesService({
      chatThreadsRepository: createChatThreadsRepositoryStub(),
      chatThreadsService: createChatThreadsServiceStub(),
      chatMessagesRepository: createChatMessagesRepositoryStub(),
      chatwootClient: createChatwootClientStub({
        createConversationIncomingAttachmentMessage,
      }),
    })

    await expect(
      service.sendCurrentUserAttachmentMessage({
        attachment: {
          data: Buffer.from('echo nope'),
          fileName: 'script.sh',
          mimeType: 'application/x-sh',
          size: 9,
        },
        clientMessageKey: 'portal-send:attachment-key',
        threadId: 'private:me',
        userId: 7,
      }),
    ).rejects.toMatchObject({
      code: 'attachment_type_not_allowed',
      statusCode: 415,
    })
    expect(createConversationIncomingAttachmentMessage).not.toHaveBeenCalled()
  })

  it('replays a confirmed attachment ledger entry without duplicate upload', async () => {
    const createConversationIncomingAttachmentMessage = vi.fn()
    const service = createChatMessagesService({
      chatThreadsRepository: createChatThreadsRepositoryStub(),
      chatThreadsService: createChatThreadsServiceStub(),
      chatMessagesRepository: createChatMessagesRepositoryStub({
        acquireSendLedgerEntry: vi.fn().mockResolvedValue({
          entry: {
            attemptsCount: 1,
            authorDisplayNameSnapshot: 'Portal User',
            chatwootMessageId: 601,
            clientMessageKey: 'portal-send:attachment-key',
            confirmedAt: new Date('2026-04-21T12:00:00.000Z'),
            createdAt: new Date('2026-04-21T12:00:00.000Z'),
            failedAt: null,
            messageKind: 'attachment',
            payloadSha256: 'hash',
            portalChatThreadId: 1,
            processingToken: null,
            status: 'confirmed',
            updatedAt: new Date('2026-04-21T12:00:00.000Z'),
            userId: 7,
          },
          outcome: 'confirmed',
        }),
      }),
      chatwootClient: createChatwootClientStub({
        createConversationIncomingAttachmentMessage,
        findConversationMessageById: vi
          .fn()
          .mockResolvedValue(sentAttachmentChatwootMessage),
      }),
    })

    await expect(
      service.sendCurrentUserAttachmentMessage({
        attachment: {
          data: Buffer.from('pdf'),
          fileName: 'invoice.pdf',
          mimeType: 'application/pdf',
          size: 3,
        },
        clientMessageKey: 'portal-send:attachment-key',
        threadId: 'private:me',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      sentMessage: {
        attachments: [
          {
            name: 'invoice.pdf',
          },
        ],
        id: 601,
      },
    })
    expect(createConversationIncomingAttachmentMessage).not.toHaveBeenCalled()
  })
})
