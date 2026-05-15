import { describe, expect, it, vi } from 'vitest'

import type { ChatContextSnapshot } from '../chat-context/service.js'
import {
  parsePublicChatThreadId,
  resolveCurrentUserChatThread,
} from './threadResolver.js'

const readyContext: ChatContextSnapshot = {
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
  reason: 'none',
  result: 'ready',
}

function createChatContextServiceStub({
  readContext = readyContext,
  writableContext = readyContext,
}: {
  readContext?: ChatContextSnapshot
  writableContext?: ChatContextSnapshot
} = {}) {
  return {
    ensureCurrentUserWritableChatContext: vi
      .fn()
      .mockResolvedValue(writableContext),
    getCurrentUserChatContext: vi.fn().mockResolvedValue(readContext),
  }
}

describe('parsePublicChatThreadId', () => {
  it('parses private and company public thread ids without accepting internal ids', () => {
    expect(parsePublicChatThreadId('private:me')).toEqual({
      id: 'private:me',
      type: 'private',
    })
    expect(parsePublicChatThreadId('company:154')).toEqual({
      chatwootCompanyContactId: 154,
      id: 'company:154',
      type: 'company',
    })

    for (const threadId of [
      '154',
      'company:0',
      'company:-1',
      'company:1.5',
      'company:abc',
      'conversation:154',
      'private:101',
      '',
    ]) {
      expect(() => parsePublicChatThreadId(threadId)).toThrowError(
        expect.objectContaining({
          code: 'chat_thread_unsupported',
          statusCode: 400,
        }),
      )
    }
  })
})

describe('resolveCurrentUserChatThread', () => {
  it('resolves the private thread through the current user chat context', async () => {
    const chatContextService = createChatContextServiceStub()

    await expect(
      resolveCurrentUserChatThread({
        chatContextService,
        mode: 'read',
        threadId: 'private:me',
        userId: 7,
      }),
    ).resolves.toEqual({
      context: readyContext,
      publicSnapshot: {
        activeThread: {
          id: 'private:me',
          subtitle: 'Только вы и поддержка',
          title: 'Личный чат',
          type: 'private',
        },
        linkedContact: readyContext.linkedContact,
        reason: 'none',
        result: 'ready',
      },
      thread: {
        id: 'private:me',
        type: 'private',
      },
    })
    expect(chatContextService.getCurrentUserChatContext).toHaveBeenCalledWith({
      selectedPrimaryConversationId: null,
      userId: 7,
    })
    expect(
      chatContextService.ensureCurrentUserWritableChatContext,
    ).not.toHaveBeenCalled()
  })

  it('resolves writable private thread context through the writable path', async () => {
    const chatContextService = createChatContextServiceStub()

    await resolveCurrentUserChatThread({
      chatContextService,
      mode: 'writable',
      threadId: 'private:me',
      userId: 7,
    })

    expect(
      chatContextService.ensureCurrentUserWritableChatContext,
    ).toHaveBeenCalledWith({
      selectedPrimaryConversationId: null,
      userId: 7,
    })
    expect(chatContextService.getCurrentUserChatContext).not.toHaveBeenCalled()
  })

  it('fails closed for company threads before resolving current private chat context', async () => {
    const chatContextService = createChatContextServiceStub()

    await expect(
      resolveCurrentUserChatThread({
        chatContextService,
        mode: 'read',
        threadId: 'company:154',
        userId: 7,
      }),
    ).rejects.toMatchObject({
      code: 'chat_thread_unavailable',
      statusCode: 403,
    })
    expect(chatContextService.getCurrentUserChatContext).not.toHaveBeenCalled()
    expect(
      chatContextService.ensureCurrentUserWritableChatContext,
    ).not.toHaveBeenCalled()
  })
})
