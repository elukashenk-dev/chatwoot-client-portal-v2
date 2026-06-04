import { describe, expect, it, vi } from 'vitest'

import type { CurrentUserChatThreadContext } from '../chat-threads/types.js'
import { createChatMessagesService } from './service.js'

const readyContext = {
  activeThread: {
    id: 'private:me',
    subtitle: 'Вы и поддержка',
    title: 'Личный чат',
    type: 'private',
  },
  chatwootContactSourceId: 'portal-contact:source',
  chatwootConversation: {
    assigneeName: 'Анна Смирнова',
    id: 101,
    inboxId: 9,
    lastActivityAt: 300,
    status: 'open',
  },
  currentUserEmail: 'user@example.test',
  currentUserName: 'Portal User',
  linkedContactId: 44,
  portalChatThreadId: 1,
  reason: 'none',
  result: 'ready',
  targetChatwootContactId: 44,
  threadType: 'private',
} satisfies CurrentUserChatThreadContext

const recoveredContext = {
  ...readyContext,
  chatwootConversation: {
    ...readyContext.chatwootConversation,
    id: 202,
    lastActivityAt: 400,
  },
} satisfies CurrentUserChatThreadContext

const groupReadyContext = {
  ...readyContext,
  activeThread: {
    id: 'group:154',
    subtitle: 'Групповой чат',
    title: 'ООО "Ромашка"',
    type: 'group',
  },
  chatwootConversation: {
    ...readyContext.chatwootConversation,
    id: 301,
  },
  currentUserName: 'Alex',
  linkedContactId: 33,
  portalChatThreadId: 5,
  targetChatwootContactId: 154,
  threadType: 'group',
} satisfies CurrentUserChatThreadContext

const recoveredGroupContext = {
  ...groupReadyContext,
  chatwootConversation: {
    ...groupReadyContext.chatwootConversation,
    id: 302,
    lastActivityAt: 500,
  },
} satisfies CurrentUserChatThreadContext

const sentChatwootMessage = {
  attachments: [],
  content: 'Portal text',
  contentAttributes: {},
  contentType: 'text',
  createdAt: 1_776_000_010,
  id: 502,
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

const sentAttachmentChatwootMessage = {
  attachments: [
    {
      extension: 'pdf',
      fileSize: 1024,
      fileType: 'file',
      id: 77,
      messageId: 602,
      name: 'invoice.pdf',
      thumbUrl: '',
      url: 'https://files.example.test/invoice.pdf',
    },
  ],
  content: null,
  contentAttributes: {},
  contentType: 'text',
  createdAt: 1_776_000_020,
  id: 602,
  messageType: 0,
  private: false,
  sender: {
    id: 154,
    name: 'ООО "Ромашка"',
    type: 'contact',
  },
  sourceId: 'portal-send:attachment-recovery-key',
  status: 'sent',
}

function createChatMessagesRepositoryStub() {
  return {
    acquireSendLedgerEntry: vi.fn().mockResolvedValue({
      entry: {
        attemptsCount: 1,
        authorDisplayNameSnapshot: 'Portal User',
        chatwootMessageId: null,
        clientMessageKey: 'portal-send:test-key',
        confirmedAt: null,
        createdAt: new Date('2026-04-21T12:00:00.000Z'),
        failedAt: null,
        messageKind: 'text',
        payloadSha256: 'hash',
        portalChatThreadId: 1,
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
  } as NonNullable<
    Parameters<typeof createChatMessagesService>[0]['chatMessagesRepository']
  >
}

describe('createChatMessagesService deleted conversation recovery', () => {
  it('recovers a deleted Chatwoot conversation and retries text send in the replacement conversation', async () => {
    const chatThreadsService = {
      ensureCurrentUserWritableThreadContext: vi
        .fn()
        .mockResolvedValue(readyContext),
      getCurrentUserThreadContext: vi.fn().mockResolvedValue(readyContext),
      recoverCurrentUserWritableThreadContext: vi
        .fn()
        .mockResolvedValue(recoveredContext),
    }
    const chatMessagesRepository = createChatMessagesRepositoryStub()
    const createConversationIncomingMessage = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(sentChatwootMessage)
    const service = createChatMessagesService({
      chatMessagesRepository,
      chatThreadsRepository: {
        findSendLedgerAuthorsByMessageIds: vi.fn().mockResolvedValue(new Map()),
      },
      chatThreadsService,
      chatwootClient: {
        createConversationIncomingAttachmentMessage: vi.fn(),
        createConversationIncomingMessage,
        findConversationMessageById: vi.fn().mockResolvedValue(null),
        findConversationMessageBySourceId: vi.fn().mockResolvedValue(null),
        listConversationMessages: vi.fn(),
        listConversationMessagesAfter: vi.fn(),
      },
      now: () => new Date('2026-04-21T12:00:00.000Z'),
    })

    await expect(
      service.sendCurrentUserTextMessage({
        clientMessageKey: 'portal-send:test-key',
        content: 'Portal text',
        threadId: 'private:me',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      reason: 'none',
      result: 'ready',
      sentMessage: {
        id: 502,
      },
    })
    expect(
      chatThreadsService.recoverCurrentUserWritableThreadContext,
    ).toHaveBeenCalledWith({
      staleConversationId: 101,
      threadId: 'private:me',
      userId: 7,
    })
    expect(createConversationIncomingMessage).toHaveBeenNthCalledWith(1, {
      content: 'Portal text',
      conversationId: 101,
      replyToMessageId: null,
      sourceId: 'portal-send:test-key',
    })
    expect(createConversationIncomingMessage).toHaveBeenNthCalledWith(2, {
      content: 'Portal text',
      conversationId: 202,
      replyToMessageId: null,
      sourceId: 'portal-send:test-key',
    })
    expect(
      chatMessagesRepository.markSendLedgerEntryFailed,
    ).toHaveBeenCalledTimes(1)
    expect(
      chatMessagesRepository.markSendLedgerEntryConfirmed,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        chatwootMessageId: 502,
        clientMessageKey: 'portal-send:test-key',
        portalChatThreadId: 1,
        userId: 7,
      }),
    )
  })

  it('recovers a deleted group conversation and retries attachment send in the replacement conversation', async () => {
    const chatThreadsService = {
      ensureCurrentUserWritableThreadContext: vi
        .fn()
        .mockResolvedValue(groupReadyContext),
      getCurrentUserThreadContext: vi.fn().mockResolvedValue(groupReadyContext),
      recoverCurrentUserWritableThreadContext: vi
        .fn()
        .mockResolvedValue(recoveredGroupContext),
    }
    const chatMessagesRepository = createChatMessagesRepositoryStub()
    const createConversationIncomingAttachmentMessage = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(sentAttachmentChatwootMessage)
    const service = createChatMessagesService({
      chatMessagesRepository,
      chatThreadsRepository: {
        findSendLedgerAuthorsByMessageIds: vi.fn().mockResolvedValue(new Map()),
      },
      chatThreadsService,
      chatwootClient: {
        createConversationIncomingAttachmentMessage,
        createConversationIncomingMessage: vi.fn(),
        findConversationMessageById: vi.fn().mockResolvedValue(null),
        findConversationMessageBySourceId: vi.fn().mockResolvedValue(null),
        listConversationMessages: vi.fn(),
        listConversationMessagesAfter: vi.fn(),
      },
      now: () => new Date('2026-04-21T12:00:00.000Z'),
    })
    const data = Buffer.from('%PDF-1.7\n')

    await expect(
      service.sendCurrentUserAttachmentMessage({
        attachment: {
          data,
          fileName: 'invoice.pdf',
          mimeType: 'application/pdf',
          size: data.byteLength,
        },
        clientMessageKey: 'portal-send:attachment-recovery-key',
        threadId: 'group:154',
        userId: 7,
      }),
    ).resolves.toMatchObject({
      activeThread: {
        id: 'group:154',
      },
      reason: 'none',
      result: 'ready',
      sentMessage: {
        attachments: [
          {
            name: 'invoice.pdf',
          },
        ],
        id: 602,
        status: 'sent',
      },
    })
    expect(
      chatThreadsService.recoverCurrentUserWritableThreadContext,
    ).toHaveBeenCalledWith({
      staleConversationId: 301,
      threadId: 'group:154',
      userId: 7,
    })
    expect(createConversationIncomingAttachmentMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        conversationId: 301,
        sourceId: 'portal-send:attachment-recovery-key',
      }),
    )
    expect(createConversationIncomingAttachmentMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        conversationId: 302,
        sourceId: 'portal-send:attachment-recovery-key',
      }),
    )
    expect(
      chatMessagesRepository.markSendLedgerEntryFailed,
    ).toHaveBeenCalledTimes(1)
    expect(
      chatMessagesRepository.markSendLedgerEntryConfirmed,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        chatwootMessageId: 602,
        clientMessageKey: 'portal-send:attachment-recovery-key',
        portalChatThreadId: 5,
        userId: 7,
      }),
    )
  })
})
