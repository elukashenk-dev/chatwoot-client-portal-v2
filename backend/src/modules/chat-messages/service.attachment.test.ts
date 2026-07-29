import { describe, expect, it, vi } from 'vitest'

import { createChatMessagesService } from './service.js'
import {
  createChatMessagesRepositoryStub,
  createChatThreadsRepositoryStub,
  createChatThreadsServiceStub,
  createChatwootClientStub,
  sentAttachmentChatwootMessage,
  sentAudioChatwootMessage,
} from './service.testSupport.js'

describe('createChatMessagesService attachment validation and replay', () => {
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
        attachments: [
          {
            data,
            fileName: 'voice-message.webm',
            mimeType: 'audio/webm;codecs=opus',
            size: data.byteLength,
          },
        ],
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
        attachments: [
          expect.objectContaining({
            fileName: 'voice-message.webm',
            mimeType: 'audio/webm;codecs=opus',
            size: data.byteLength,
          }),
        ],
        sourceId: 'portal-user-send:v1:7:portal-send:voice-key',
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
        attachments: [
          {
            data: Buffer.from('echo nope'),
            fileName: 'script.sh',
            mimeType: 'application/x-sh',
            size: 9,
          },
        ],
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

  it('rejects an attachment batch when the send key payload changed', async () => {
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
            payloadSha256: 'different-hash',
            portalChatThreadId: 1,
            processingToken: null,
            status: 'confirmed',
            updatedAt: new Date('2026-04-21T12:00:00.000Z'),
            userId: 7,
          },
          outcome: 'payload_mismatch',
        }),
      }),
      chatwootClient: createChatwootClientStub({
        createConversationIncomingAttachmentMessage,
      }),
    })

    await expect(
      service.sendCurrentUserAttachmentMessage({
        attachments: [
          {
            data: Buffer.from('pdf'),
            fileName: 'invoice.pdf',
            mimeType: 'application/pdf',
            size: 3,
          },
        ],
        clientMessageKey: 'portal-send:attachment-key',
        threadId: 'private:me',
        userId: 7,
      }),
    ).rejects.toMatchObject({
      code: 'client_message_key_conflict',
      statusCode: 409,
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
        attachments: [
          {
            data: Buffer.from('pdf'),
            fileName: 'invoice.pdf',
            mimeType: 'application/pdf',
            size: 3,
          },
        ],
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
