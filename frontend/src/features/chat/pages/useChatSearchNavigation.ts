import { useCallback, useEffect, useState } from 'react'

import type { ChatMessage, ChatSearchResult } from '../types'

type UseChatSearchNavigationOptions = {
  closeChatSearch: () => void
  visibleMessages: ChatMessage[]
}

export function useChatSearchNavigation({
  closeChatSearch,
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
      closeChatSearch()

      const isLoadedInTranscript = visibleMessages.some(
        (message) => message.id === result.messageId,
      )

      if (isLoadedInTranscript) {
        setHighlightedMessageId(result.messageId)
      }
    },
    [closeChatSearch, visibleMessages],
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
