import { vi } from 'vitest'

import type { CurrentUserChatThreadContext } from '../chat-threads/types.js'
import { createChatMessagesService } from './service.js'

type ChatMessagesServiceOptions = Parameters<
  typeof createChatMessagesService
>[0]

export type ClearOpenedThreadUnread = NonNullable<
  ChatMessagesServiceOptions['chatUnreadService']
>['clearOpenedThreadUnread']

export const readyContext = {
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
  reason: 'none' as const,
  result: 'ready' as const,
  targetChatwootContactId: 44,
  threadType: 'private' as const,
} satisfies CurrentUserChatThreadContext

export const sentChatwootMessage = {
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

export const sentAttachmentChatwootMessage = {
  attachments: [
    {
      extension: 'pdf',
      fileSize: 1024,
      fileType: 'file',
      id: 77,
      messageId: 601,
      name: 'invoice.pdf',
      thumbUrl: '',
      url: 'https://files.example.test/invoice.pdf',
    },
  ],
  content: null,
  contentAttributes: {},
  contentType: 'text',
  createdAt: 1_776_000_020,
  id: 601,
  messageType: 0,
  private: false,
  sender: {
    id: 44,
    name: 'Portal User',
    type: 'contact',
  },
  sourceId: 'portal-send:attachment-key',
  status: 'sent',
}

export const sentAudioChatwootMessage = {
  attachments: [
    {
      extension: 'webm',
      fileSize: 2048,
      fileType: 'audio',
      id: 78,
      messageId: 602,
      name: 'voice-message.webm',
      thumbUrl: '',
      url: 'https://files.example.test/voice-message.webm',
    },
  ],
  content: null,
  contentAttributes: {},
  contentType: 'text',
  createdAt: 1_776_000_021,
  id: 602,
  messageType: 0,
  private: false,
  sender: {
    id: 44,
    name: 'Portal User',
    type: 'contact',
  },
  sourceId: 'portal-send:voice-key',
  status: 'sent',
}

export function createChatThreadsServiceStub({
  context = readyContext,
  writableContext = readyContext,
}: {
  context?: CurrentUserChatThreadContext
  writableContext?: CurrentUserChatThreadContext
} = {}) {
  return {
    ensureCurrentUserWritableThreadContext: vi
      .fn()
      .mockResolvedValue(writableContext),
    getCurrentUserThreadContext: vi.fn().mockResolvedValue(context),
    listCurrentUserThreads: vi.fn().mockResolvedValue({
      activeThreadId: 'private:me',
      threads: [
        {
          avatarUrl: '/api/tenant/icons/icon-192.png',
          id: 'private:me',
          subtitle: 'Вы и поддержка',
          title: 'Личный чат',
          type: 'private',
          unreadCount: 3,
        },
      ],
      totalUnreadCount: 3,
    }),
    recoverCurrentUserWritableThreadContext: vi
      .fn()
      .mockResolvedValue(writableContext),
  }
}

export function createChatwootClientStub(
  overrides: Partial<ChatMessagesServiceOptions['chatwootClient']> = {},
): ChatMessagesServiceOptions['chatwootClient'] {
  return {
    createConversationIncomingAttachmentMessage: vi
      .fn()
      .mockResolvedValue(sentAttachmentChatwootMessage),
    createConversationIncomingMessage: vi
      .fn()
      .mockResolvedValue(sentChatwootMessage),
    findConversationMessageById: vi.fn().mockResolvedValue(null),
    findConversationMessageBySourceId: vi.fn().mockResolvedValue(null),
    listConversationMessages: vi.fn(),
    listConversationMessagesAfter: vi.fn(),
    ...overrides,
  }
}

export function createChatMessagesRepositoryStub(
  overrides: Partial<
    NonNullable<ChatMessagesServiceOptions['chatMessagesRepository']>
  > = {},
): NonNullable<ChatMessagesServiceOptions['chatMessagesRepository']> {
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
    ...overrides,
  }
}

export function createChatThreadsRepositoryStub() {
  return {
    findSendLedgerAuthorsByMessageIds: vi.fn().mockResolvedValue(new Map()),
  }
}
