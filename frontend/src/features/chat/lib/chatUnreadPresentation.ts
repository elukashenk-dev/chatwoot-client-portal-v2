import type { ChatThreadListSummary, ChatThreadSummary } from '../types'

export function readThreadUnreadCount(thread: ChatThreadSummary) {
  const unreadCount = (thread as Partial<ChatThreadListSummary>).unreadCount

  return typeof unreadCount === 'number' ? unreadCount : 0
}

export function formatUnreadCount(unreadCount: number) {
  return unreadCount > 99 ? '99+' : String(unreadCount)
}

export function hasUnreadOutsideSelectedThread(
  threads: ChatThreadSummary[],
  selectedThreadId: string | null,
) {
  return threads.some(
    (thread) =>
      thread.id !== selectedThreadId && readThreadUnreadCount(thread) > 0,
  )
}
