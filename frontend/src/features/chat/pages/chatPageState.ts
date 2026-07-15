import type {
  ChatMessagesSnapshot,
  ChatThreadListSummary,
  ChatThreadReason,
} from '../types'

export type ChatReachability = 'connecting' | 'offline' | 'online'

export type ChatPageCacheState = {
  cachedSavedAt: string | null
  isUsingCachedData: boolean
}

export const ONLINE_CHAT_PAGE_CACHE_STATE = {
  cachedSavedAt: null,
  isUsingCachedData: false,
} satisfies ChatPageCacheState

type ChatPageThreadState = ChatPageCacheState & {
  selectedThreadId: string | null
  threads: ChatThreadListSummary[]
}

export type ChatPageState =
  | (ChatPageThreadState & {
      status: 'error'
      errorMessage: string
      errorReason: ChatThreadReason
      snapshot: ChatMessagesSnapshot | null
    })
  | (ChatPageThreadState & {
      status: 'loading'
      snapshot: ChatMessagesSnapshot | null
    })
  | (ChatPageThreadState & {
      status: 'ready'
      snapshot: ChatMessagesSnapshot
    })

export const INITIAL_CHAT_PAGE_STATE = {
  ...ONLINE_CHAT_PAGE_CACHE_STATE,
  selectedThreadId: null,
  snapshot: null,
  status: 'loading',
  threads: [],
} satisfies ChatPageState

export function readChatPageCacheState(
  state: ChatPageState,
): ChatPageCacheState {
  return {
    cachedSavedAt: state.cachedSavedAt,
    isUsingCachedData: state.isUsingCachedData,
  }
}

export function clearThreadUnreadCount(
  threads: ChatThreadListSummary[],
  clearedThreadId: string,
) {
  return threads.map((thread) =>
    thread.id === clearedThreadId ? { ...thread, unreadCount: 0 } : thread,
  )
}

export function applyPushUnreadCounts(
  threads: ChatThreadListSummary[],
  payload: {
    threadId: string | null
    threadUnreadCount: number | null
    totalUnreadCount: number | null
  },
) {
  if (
    !payload.threadId ||
    payload.threadUnreadCount === null ||
    payload.totalUnreadCount === null
  ) {
    return threads
  }

  return threads.map((thread) =>
    thread.id === payload.threadId
      ? {
          ...thread,
          unreadCount: payload.threadUnreadCount ?? thread.unreadCount,
        }
      : thread,
  )
}
