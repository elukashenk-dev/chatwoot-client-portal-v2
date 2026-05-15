import { ApiError } from '../../lib/errors.js'
import type { ChatContextSnapshot } from '../chat-context/service.js'

export const PRIVATE_CHAT_THREAD_ID = 'private:me'

export type ChatThreadSummary = {
  id: typeof PRIVATE_CHAT_THREAD_ID
  subtitle: string
  title: string
  type: 'private'
}

export type PublicChatContextSnapshot = Omit<
  ChatContextSnapshot,
  'primaryConversation'
> & {
  activeThread: ChatThreadSummary | null
}

const PRIVATE_CHAT_THREAD: ChatThreadSummary = {
  id: PRIVATE_CHAT_THREAD_ID,
  subtitle: 'Только вы и поддержка',
  title: 'Личный чат',
  type: 'private',
}

export function assertPrivateChatThreadId(threadId: string) {
  if (threadId !== PRIVATE_CHAT_THREAD_ID) {
    throw new ApiError(400, 'chat_thread_unsupported', 'Этот чат недоступен.')
  }
}

export function mapPublicChatContextSnapshot(
  context: ChatContextSnapshot,
): PublicChatContextSnapshot {
  const { primaryConversation: _primaryConversation, ...publicContext } =
    context

  return {
    ...publicContext,
    activeThread: context.linkedContact ? { ...PRIVATE_CHAT_THREAD } : null,
  }
}
