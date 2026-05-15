import type { ChatMessagesSnapshot } from '../types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

type OpenChatRealtimeInput = {
  onChatState: (snapshot: ChatMessagesSnapshot) => void
  onOpen?: () => void
  onMessages: (snapshot: ChatMessagesSnapshot) => void
  threadId: string
}

function buildRealtimeUrl(threadId: string) {
  const url = new URL(
    `${API_BASE_URL.replace(/\/+$/, '')}/chat/realtime`,
    window.location.origin,
  )

  url.searchParams.set('threadId', threadId)

  return url.toString()
}

function readSnapshotEvent(event: Event) {
  return JSON.parse(
    (event as MessageEvent<string>).data,
  ) as ChatMessagesSnapshot
}

export function openChatRealtime({
  onChatState,
  onOpen,
  onMessages,
  threadId,
}: OpenChatRealtimeInput) {
  if (typeof EventSource === 'undefined') {
    return {
      close() {},
    }
  }

  const eventSource = new EventSource(buildRealtimeUrl(threadId), {
    withCredentials: true,
  })

  eventSource.addEventListener('open', () => {
    onOpen?.()
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
