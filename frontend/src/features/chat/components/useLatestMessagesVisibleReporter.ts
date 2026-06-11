import { useCallback } from 'react'

import type { ChatMessage } from '../types'
import { isTranscriptNearBottom } from './ChatTranscriptScroll'

export type LatestMessagesVisibleBoundary = {
  latestVisibleAgentMessageId: number | null
}

function isMessageVisibleInTranscript({
  messageElement,
  scrollElement,
}: {
  messageElement: HTMLElement
  scrollElement: HTMLElement
}) {
  const scrollRect = scrollElement.getBoundingClientRect()
  const messageRect = messageElement.getBoundingClientRect()

  if (scrollRect.height <= 0 || messageRect.height <= 0) {
    return true
  }

  return (
    messageRect.bottom > scrollRect.top && messageRect.top < scrollRect.bottom
  )
}

function getLatestVisibleAgentMessageId(
  messages: ChatMessage[],
  scrollElement: HTMLElement,
) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]

    if (message?.direction !== 'incoming') {
      continue
    }

    const messageElement = scrollElement.querySelector(
      `[data-message-id="${message.id}"]`,
    )

    if (
      messageElement instanceof HTMLElement &&
      isMessageVisibleInTranscript({ messageElement, scrollElement })
    ) {
      return message.id
    }
  }

  return null
}

export function useLatestMessagesVisibleReporter({
  hasHistoryFragmentControls,
  messages,
  onLatestMessagesVisible,
}: {
  hasHistoryFragmentControls: boolean
  messages: ChatMessage[]
  onLatestMessagesVisible?: (boundary: LatestMessagesVisibleBoundary) => void
}) {
  return useCallback(
    (scrollElement: HTMLElement) => {
      if (
        !onLatestMessagesVisible ||
        hasHistoryFragmentControls ||
        !isTranscriptNearBottom(scrollElement)
      ) {
        return
      }

      onLatestMessagesVisible({
        latestVisibleAgentMessageId: getLatestVisibleAgentMessageId(
          messages,
          scrollElement,
        ),
      })
    },
    [hasHistoryFragmentControls, messages, onLatestMessagesVisible],
  )
}
