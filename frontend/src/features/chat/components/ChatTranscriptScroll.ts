import type { ChatMessage } from '../types'

const TRANSCRIPT_BOTTOM_THRESHOLD_PX = 48

export type TranscriptMessageBoundary = {
  firstMessageId: number | null
  lastMessageId: number | null
  latestMessageDirection: ChatMessage['direction'] | null
  messageCount: number
}

export type TranscriptScrollSnapshot = TranscriptMessageBoundary & {
  clientHeight: number
  scrollHeight: number
  scrollTop: number
  wasNearBottom: boolean
}

export type TranscriptScrollAction =
  | {
      type: 'none'
    }
  | {
      nextScrollTop: number
      type: 'preserve_prepend'
    }
  | {
      type: 'scroll_to_bottom'
    }

export function createTranscriptMessageBoundary(
  messages: ChatMessage[],
): TranscriptMessageBoundary {
  const firstMessage = messages[0] ?? null
  const lastMessage = messages[messages.length - 1] ?? null

  return {
    firstMessageId: firstMessage?.id ?? null,
    lastMessageId: lastMessage?.id ?? null,
    latestMessageDirection: lastMessage?.direction ?? null,
    messageCount: messages.length,
  }
}

export function isTranscriptNearBottom(element: HTMLElement) {
  return (
    element.scrollHeight - (element.scrollTop + element.clientHeight) <=
    TRANSCRIPT_BOTTOM_THRESHOLD_PX
  )
}

export function captureTranscriptScrollSnapshot(
  element: HTMLElement,
  messages: ChatMessage[],
): TranscriptScrollSnapshot {
  return {
    ...createTranscriptMessageBoundary(messages),
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
    wasNearBottom: isTranscriptNearBottom(element),
  }
}

export function getTranscriptScrollAction({
  currentBoundary,
  currentScrollHeight,
  previousSnapshot,
}: {
  currentBoundary: TranscriptMessageBoundary
  currentScrollHeight: number
  previousSnapshot: TranscriptScrollSnapshot | null
}): TranscriptScrollAction {
  if (currentBoundary.messageCount === 0) {
    return {
      type: 'none',
    }
  }

  if (!previousSnapshot || previousSnapshot.messageCount === 0) {
    return {
      type: 'scroll_to_bottom',
    }
  }

  const hasPrependedOlderMessages =
    currentBoundary.messageCount > previousSnapshot.messageCount &&
    currentBoundary.lastMessageId === previousSnapshot.lastMessageId &&
    currentBoundary.firstMessageId !== previousSnapshot.firstMessageId

  if (hasPrependedOlderMessages) {
    return {
      nextScrollTop:
        previousSnapshot.scrollTop +
        (currentScrollHeight - previousSnapshot.scrollHeight),
      type: 'preserve_prepend',
    }
  }

  const hasAppendedNewMessages =
    currentBoundary.messageCount >= previousSnapshot.messageCount &&
    currentBoundary.lastMessageId !== previousSnapshot.lastMessageId

  if (
    hasAppendedNewMessages &&
    (previousSnapshot.wasNearBottom ||
      currentBoundary.latestMessageDirection === 'outgoing')
  ) {
    return {
      type: 'scroll_to_bottom',
    }
  }

  return {
    type: 'none',
  }
}
