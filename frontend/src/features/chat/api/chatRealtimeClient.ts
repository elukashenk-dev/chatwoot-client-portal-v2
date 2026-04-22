import type { ChatMessagesSnapshot } from '../types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

type OpenChatRealtimeInput = {
  onChatState: (snapshot: ChatMessagesSnapshot) => void
  onMessages: (snapshot: ChatMessagesSnapshot) => void
  primaryConversationId: number
}

function buildRealtimeUrl(primaryConversationId: number) {
  const url = new URL(
    `${API_BASE_URL.replace(/\/+$/, '')}/chat/realtime`,
    window.location.origin,
  )

  url.searchParams.set('primaryConversationId', String(primaryConversationId))

  return url.toString()
}

function readSnapshotEvent(event: Event) {
  return JSON.parse(
    (event as MessageEvent<string>).data,
  ) as ChatMessagesSnapshot
}

export function openChatRealtime({
  onChatState,
  onMessages,
  primaryConversationId,
}: OpenChatRealtimeInput) {
  if (typeof EventSource === 'undefined') {
    return {
      close() {},
    }
  }

  const eventSource = new EventSource(buildRealtimeUrl(primaryConversationId), {
    withCredentials: true,
  })

  eventSource.addEventListener('messages', (event) => {
    onMessages(readSnapshotEvent(event))
  })
  eventSource.addEventListener('chat-state', (event) => {
    onChatState(readSnapshotEvent(event))
  })

  return {
    close() {
      eventSource.close()
    },
  }
}
