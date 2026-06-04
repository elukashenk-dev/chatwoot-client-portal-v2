import type { ChatMessagesSnapshot } from '../types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

export type ChatTypingEvent = {
  actor: 'agent'
  isTyping: boolean
  threadId: string
}

type OpenChatRealtimeInput = {
  onActivity?: () => void
  onChatState: (snapshot: ChatMessagesSnapshot) => void
  onError?: () => void
  onOpen?: () => void
  onMessages: (snapshot: ChatMessagesSnapshot) => void
  onTyping?: (event: ChatTypingEvent) => void
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

function readTypingEvent(event: Event) {
  return JSON.parse((event as MessageEvent<string>).data) as ChatTypingEvent
}

export function openChatRealtime({
  onActivity,
  onChatState,
  onError,
  onOpen,
  onMessages,
  onTyping,
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
    onActivity?.()
    onOpen?.()
  })
  eventSource.addEventListener('messages', (event) => {
    onActivity?.()
    onMessages(readSnapshotEvent(event))
  })
  eventSource.addEventListener('chat-state', (event) => {
    onActivity?.()
    onChatState(readSnapshotEvent(event))
  })
  eventSource.addEventListener('typing', (event) => {
    onActivity?.()
    onTyping?.(readTypingEvent(event))
  })
  eventSource.addEventListener('error', () => {
    onError?.()
  })

  return {
    close() {
      eventSource.close()
    },
  }
}
