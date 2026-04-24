import type {
  ChatMessage,
  ChatMessagesSnapshot,
  ChatSendResult,
} from '../types'
import type { MessageComposerReplyTarget } from '../components/message-composer/types'

function appendSentMessage(messages: ChatMessage[], sentMessage: ChatMessage) {
  if (messages.some((message) => message.id === sentMessage.id)) {
    return messages
  }

  return [...messages, sentMessage]
}

function sortMessagesByTimeline(messages: ChatMessage[]) {
  return [...messages].sort((left, right) => {
    const leftTime = new Date(left.createdAt).getTime()
    const rightTime = new Date(right.createdAt).getTime()

    if (leftTime !== rightTime) {
      return leftTime - rightTime
    }

    return left.id - right.id
  })
}

export function mergeOlderMessages(
  currentSnapshot: ChatMessagesSnapshot,
  olderSnapshot: ChatMessagesSnapshot,
): ChatMessagesSnapshot {
  const currentIds = new Set(
    currentSnapshot.messages.map((message) => message.id),
  )
  const olderMessages = olderSnapshot.messages.filter(
    (message) => !currentIds.has(message.id),
  )

  return {
    ...olderSnapshot,
    messages: [...olderMessages, ...currentSnapshot.messages],
  }
}

export function mergeRealtimeSnapshot({
  currentSnapshot,
  realtimeSnapshot,
}: {
  currentSnapshot: ChatMessagesSnapshot
  realtimeSnapshot: ChatMessagesSnapshot
}): ChatMessagesSnapshot {
  if (
    currentSnapshot.result !== 'ready' ||
    !currentSnapshot.primaryConversation ||
    realtimeSnapshot.result !== 'ready' ||
    !realtimeSnapshot.primaryConversation ||
    currentSnapshot.primaryConversation.id !==
      realtimeSnapshot.primaryConversation.id
  ) {
    return realtimeSnapshot
  }

  const messagesById = new Map(
    currentSnapshot.messages.map((message) => [message.id, message]),
  )

  for (const message of realtimeSnapshot.messages) {
    messagesById.set(message.id, message)
  }

  return {
    ...realtimeSnapshot,
    hasMoreOlder: currentSnapshot.hasMoreOlder || realtimeSnapshot.hasMoreOlder,
    messages: sortMessagesByTimeline([...messagesById.values()]),
    nextOlderCursor:
      currentSnapshot.nextOlderCursor ?? realtimeSnapshot.nextOlderCursor,
  }
}

export function isFirstConversationBootstrapReady(
  snapshot: ChatMessagesSnapshot,
) {
  return (
    snapshot.result === 'not_ready' &&
    snapshot.reason === 'conversation_missing' &&
    snapshot.linkedContact !== null
  )
}

export function toComposerReplyTarget(
  message: ChatMessage,
): MessageComposerReplyTarget {
  return {
    attachmentName: message.attachments[0]?.name ?? null,
    authorName: message.authorName,
    content: message.content,
    direction: message.direction,
    id: message.id,
  }
}

export function buildSnapshotFromSendResult({
  currentSnapshot,
  sendResult,
}: {
  currentSnapshot: ChatMessagesSnapshot | null
  sendResult: ChatSendResult
}): ChatMessagesSnapshot {
  return {
    hasMoreOlder: currentSnapshot?.hasMoreOlder ?? false,
    linkedContact: sendResult.linkedContact,
    messages: sendResult.sentMessage
      ? appendSentMessage(
          currentSnapshot?.messages ?? [],
          sendResult.sentMessage,
        )
      : (currentSnapshot?.messages ?? []),
    nextOlderCursor: currentSnapshot?.nextOlderCursor ?? null,
    primaryConversation: sendResult.primaryConversation,
    reason: sendResult.reason,
    result: sendResult.result,
  }
}
