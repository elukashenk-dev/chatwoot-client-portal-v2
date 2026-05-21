import { useCallback, useEffect, useState } from 'react'

import type { ChatMessage, ChatSearchResult } from '../types'

type UseChatSearchNavigationOptions = {
  clearHistoryFragment: () => void
  closeChatSearch: () => void
  displayedMessages: ChatMessage[]
  latestMessages: ChatMessage[]
  openSearchResultContext: (result: ChatSearchResult) => Promise<boolean>
}

export function useChatSearchNavigation({
  clearHistoryFragment,
  closeChatSearch,
  displayedMessages,
  latestMessages,
  openSearchResultContext,
}: UseChatSearchNavigationOptions) {
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    number | null
  >(null)
  const [highlightedMessageScrollSignal, setHighlightedMessageScrollSignal] =
    useState(0)

  const clearHighlightedMessage = useCallback(() => {
    setHighlightedMessageId(null)
  }, [])
  const highlightSearchResult = useCallback((messageId: number) => {
    setHighlightedMessageId(messageId)
    setHighlightedMessageScrollSignal((signal) => signal + 1)
  }, [])

  const handleOpenSearchResult = useCallback(
    (result: ChatSearchResult) => {
      const isLoadedInDisplayedTranscript = displayedMessages.some(
        (message) => message.id === result.messageId,
      )

      if (isLoadedInDisplayedTranscript) {
        closeChatSearch()
        highlightSearchResult(result.messageId)
        return
      }

      const isLoadedInLatestTranscript = latestMessages.some(
        (message) => message.id === result.messageId,
      )

      if (isLoadedInLatestTranscript) {
        clearHistoryFragment()
        closeChatSearch()
        highlightSearchResult(result.messageId)
        return
      }

      void openSearchResultContext(result).then((didOpenContext) => {
        if (!didOpenContext) {
          return
        }

        closeChatSearch()
        highlightSearchResult(result.messageId)
      })
    },
    [
      clearHistoryFragment,
      closeChatSearch,
      displayedMessages,
      highlightSearchResult,
      latestMessages,
      openSearchResultContext,
    ],
  )

  useEffect(() => {
    if (highlightedMessageId === null) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setHighlightedMessageId((currentMessageId) =>
        currentMessageId === highlightedMessageId ? null : currentMessageId,
      )
    }, 1800)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [highlightedMessageId, highlightedMessageScrollSignal])

  return {
    clearHighlightedMessage,
    handleOpenSearchResult,
    highlightedMessageId,
    highlightedMessageScrollSignal,
  }
}
