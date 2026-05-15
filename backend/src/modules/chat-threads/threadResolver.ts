import { ApiError } from '../../lib/errors.js'
import type { ChatContextService } from '../chat-context/service.js'
import {
  mapPublicChatContextSnapshot,
  PRIVATE_CHAT_THREAD_ID,
} from './privateThread.js'

const COMPANY_THREAD_ID_PATTERN = /^company:([1-9]\d*)$/
const CHAT_THREAD_ID_MAX_LENGTH = 64

export type ParsedPublicChatThread =
  | {
      id: typeof PRIVATE_CHAT_THREAD_ID
      type: 'private'
    }
  | {
      chatwootCompanyContactId: number
      id: `company:${number}`
      type: 'company'
    }

type ReadChatContextService = Pick<
  ChatContextService,
  'getCurrentUserChatContext'
>

type WritableChatContextService = Pick<
  ChatContextService,
  'ensureCurrentUserWritableChatContext'
>

type ResolveCurrentUserChatThreadInput =
  | {
      chatContextService: ReadChatContextService
      mode: 'read'
      threadId: string
      userId: number
    }
  | {
      chatContextService: WritableChatContextService
      mode: 'writable'
      threadId: string
      userId: number
    }

function createUnsupportedThreadError() {
  return new ApiError(400, 'chat_thread_unsupported', 'Этот чат недоступен.')
}

function createUnavailableThreadError() {
  return new ApiError(403, 'chat_thread_unavailable', 'Этот чат недоступен.')
}

export function parsePublicChatThreadId(
  threadId: string,
): ParsedPublicChatThread {
  if (threadId.length === 0 || threadId.length > CHAT_THREAD_ID_MAX_LENGTH) {
    throw createUnsupportedThreadError()
  }

  if (threadId === PRIVATE_CHAT_THREAD_ID) {
    return {
      id: PRIVATE_CHAT_THREAD_ID,
      type: 'private',
    }
  }

  const companyMatch = COMPANY_THREAD_ID_PATTERN.exec(threadId)

  if (!companyMatch?.[1]) {
    throw createUnsupportedThreadError()
  }

  const chatwootCompanyContactId = Number(companyMatch[1])

  if (!Number.isSafeInteger(chatwootCompanyContactId)) {
    throw createUnsupportedThreadError()
  }

  return {
    chatwootCompanyContactId,
    id: `company:${chatwootCompanyContactId}`,
    type: 'company',
  }
}

export function assertPublicChatThreadRuntimeAvailable(threadId: string) {
  const thread = parsePublicChatThreadId(threadId)

  if (thread.type === 'company') {
    throw createUnavailableThreadError()
  }

  return thread
}

export async function resolveCurrentUserChatThread(
  input: ResolveCurrentUserChatThreadInput,
) {
  const thread = assertPublicChatThreadRuntimeAvailable(input.threadId)

  const context =
    input.mode === 'writable'
      ? await input.chatContextService.ensureCurrentUserWritableChatContext({
          selectedPrimaryConversationId: null,
          userId: input.userId,
        })
      : await input.chatContextService.getCurrentUserChatContext({
          selectedPrimaryConversationId: null,
          userId: input.userId,
        })

  return {
    context,
    publicSnapshot: mapPublicChatContextSnapshot(context),
    thread,
  }
}
