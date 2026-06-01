import type { Dispatch, SetStateAction } from 'react'

import type { useChatSearchResultContext } from './useChatSearchResultContext'

type ChatSearchResultContext = ReturnType<typeof useChatSearchResultContext>

type CreateChatHistoryFragmentControlsInput = {
  clearHighlightedMessage: () => void
  clearHistoryFragment: () => void
  historyFragment: ChatSearchResultContext['historyFragment']
  loadHistoryFragmentContext: ChatSearchResultContext['loadHistoryFragmentContext']
  setForceScrollToBottomSignal: Dispatch<SetStateAction<number>>
}

export function createChatHistoryFragmentControls({
  clearHighlightedMessage,
  clearHistoryFragment,
  historyFragment,
  loadHistoryFragmentContext,
  setForceScrollToBottomSignal,
}: CreateChatHistoryFragmentControlsInput) {
  return historyFragment
    ? {
        errorMessage: historyFragment.errorMessage,
        hasMoreEarlier: historyFragment.hasMoreEarlier,
        hasMoreLater: historyFragment.hasMoreLater,
        isLoadingEarlier: historyFragment.isLoadingEarlier,
        isLoadingLater: historyFragment.isLoadingLater,
        onLoadEarlier: () => {
          void loadHistoryFragmentContext('earlier')
        },
        onLoadLater: () => {
          void loadHistoryFragmentContext('later')
        },
        onReturnToLatest: () => {
          clearHistoryFragment()
          clearHighlightedMessage()
          setForceScrollToBottomSignal((signal) => signal + 1)
        },
      }
    : null
}
