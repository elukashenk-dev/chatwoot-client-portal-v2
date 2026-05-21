import { useCallback, useEffect, useState } from 'react'

import type { ChatMessage, ChatSearchResult } from '../types'

type UseChatSearchNavigationOptions = {
  closeChatSearch: () => void
  openSearchResultContext: (result: ChatSearchResult) => Promise<boolean>
  visibleMessages: ChatMessage[]
}

export function useChatSearchNavigation({
  closeChatSearch,
  openSearchResultContext,
  visibleMessages,
}: UseChatSearchNavigationOptions) {
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    number | null
  >(null)

  const clearHighlightedMessage = useCallback(() => {
    setHighlightedMessageId(null)
  }, [])

  const handleOpenSearchResult = useCallback(
    (result: ChatSearchResult) => {
      const isLoadedInTranscript = visibleMessages.some(
        (message) => message.id === result.messageId,
      )

      if (isLoadedInTranscript) {
        closeChatSearch()
        setHighlightedMessageId(result.messageId)
        return
      }

      void openSearchResultContext(result).then((didOpenContext) => {
        if (!didOpenContext) {
          return
        }

        closeChatSearch()
        setHighlightedMessageId(result.messageId)
      })
    },
    [closeChatSearch, openSearchResultContext, visibleMessages],
  )

  useEffect(() => {
    if (highlightedMessageId === null) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(
          `[data-message-id="${highlightedMessageId}"]`,
        )
        ?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
    })
    const timeoutId = window.setTimeout(() => {
      setHighlightedMessageId((currentMessageId) =>
        currentMessageId === highlightedMessageId ? null : currentMessageId,
      )
    }, 1800)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.clearTimeout(timeoutId)
    }
  }, [highlightedMessageId])

  return {
    clearHighlightedMessage,
    handleOpenSearchResult,
    highlightedMessageId,
  }
}
