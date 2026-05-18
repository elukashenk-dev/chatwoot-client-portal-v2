import { ApiError } from '../../lib/errors.js'
import { PRIVATE_CHAT_THREAD_ID } from './privateThread.js'

const GROUP_THREAD_ID_PATTERN = /^group:([1-9]\d*)$/
const CHAT_THREAD_ID_MAX_LENGTH = 64

export type ParsedPublicChatThread =
  | {
      id: typeof PRIVATE_CHAT_THREAD_ID
      type: 'private'
    }
  | {
      chatwootGroupContactId: number
      id: `group:${number}`
      type: 'group'
    }

function createUnsupportedThreadError() {
  return new ApiError(400, 'chat_thread_unsupported', 'Этот чат недоступен.')
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

  const groupMatch = GROUP_THREAD_ID_PATTERN.exec(threadId)

  if (!groupMatch?.[1]) {
    throw createUnsupportedThreadError()
  }

  const chatwootGroupContactId = Number(groupMatch[1])

  if (!Number.isSafeInteger(chatwootGroupContactId)) {
    throw createUnsupportedThreadError()
  }

  return {
    chatwootGroupContactId,
    id: `group:${chatwootGroupContactId}`,
    type: 'group',
  }
}
