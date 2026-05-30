import type { ChatMessagesSnapshot, ChatThreadSummary } from '../types'

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
  threads: ChatThreadSummary[]
}

export type ChatPageState =
  | (ChatPageThreadState & {
      status: 'error'
      errorMessage: string
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
