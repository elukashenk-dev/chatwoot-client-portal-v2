import { ApiError } from '../../lib/errors.js'

export const PRIVATE_CHAT_THREAD_ID = 'private:me'

export function assertPrivateChatThreadId(threadId: string) {
  if (threadId !== PRIVATE_CHAT_THREAD_ID) {
    throw new ApiError(400, 'chat_thread_unsupported', 'Этот чат недоступен.')
  }
}
