import { ApiError } from '../../lib/errors.js'
import { PRIVATE_CHAT_THREAD_ID } from './privateThread.js'

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
