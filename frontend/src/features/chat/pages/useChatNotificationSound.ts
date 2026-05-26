import { useEffect, useRef } from 'react'

import type { ChatMessage } from '../types'

type UseChatNotificationSoundOptions = {
  activeThreadId: string | null
  enabled: boolean
  messages: ChatMessage[]
  playSound?: () => void
}

type MessageTimelinePoint = {
  id: number
  timestamp: number
}

function getMessageTimelinePoint(message: ChatMessage): MessageTimelinePoint {
  return {
    id: message.id,
    timestamp: new Date(message.createdAt).getTime(),
  }
}

function isAfterTimelinePoint(
  message: ChatMessage,
  point: MessageTimelinePoint | null,
) {
  if (!point) {
    return false
  }

  const messagePoint = getMessageTimelinePoint(message)

  if (messagePoint.timestamp !== point.timestamp) {
    return messagePoint.timestamp > point.timestamp
  }

  return messagePoint.id > point.id
}

function getLatestTimelinePoint(
  messages: ChatMessage[],
  previous: MessageTimelinePoint | null,
) {
  return messages.reduce<MessageTimelinePoint | null>((latest, message) => {
    const point = getMessageTimelinePoint(message)

    if (!latest || isAfterTimelinePoint(message, latest)) {
      return point
    }

    return latest
  }, previous)
}

function playDefaultNotificationSound() {
  const AudioContextConstructor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext

  if (!AudioContextConstructor) {
    return
  }

  try {
    const audioContext = new AudioContextConstructor()
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(720, audioContext.currentTime)
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime)
    gain.gain.exponentialRampToValueAtTime(
      0.08,
      audioContext.currentTime + 0.01,
    )
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      audioContext.currentTime + 0.16,
    )
    oscillator.connect(gain)
    gain.connect(audioContext.destination)
    oscillator.start()
    oscillator.stop(audioContext.currentTime + 0.18)
    oscillator.addEventListener('ended', () => {
      void audioContext.close().catch(() => {})
    })
  } catch {
    // Browsers may block Web Audio until a user gesture. Notification sound is best-effort.
  }
}

export function useChatNotificationSound({
  activeThreadId,
  enabled,
  messages,
  playSound = playDefaultNotificationSound,
}: UseChatNotificationSoundOptions) {
  const previousThreadIdRef = useRef<string | null>(null)
  const seenMessageIdsByThreadRef = useRef(new Map<string, Set<number>>())
  const latestTimelinePointByThreadRef = useRef(
    new Map<string, MessageTimelinePoint>(),
  )

  useEffect(() => {
    if (!activeThreadId) {
      previousThreadIdRef.current = null
      return
    }

    const seenMessageIds =
      seenMessageIdsByThreadRef.current.get(activeThreadId) ?? new Set<number>()
    const previousLatestTimelinePoint =
      latestTimelinePointByThreadRef.current.get(activeThreadId) ?? null
    const isNewThread = previousThreadIdRef.current !== activeThreadId
    const unseenMessages = messages.filter(
      (message) => !seenMessageIds.has(message.id),
    )
    const shouldPlaySound =
      !isNewThread &&
      enabled &&
      unseenMessages.some(
        (message) =>
          message.direction === 'incoming' &&
          message.authorRole !== 'current_user' &&
          isAfterTimelinePoint(message, previousLatestTimelinePoint),
      )
    const latestTimelinePoint = getLatestTimelinePoint(
      messages,
      previousLatestTimelinePoint,
    )

    for (const message of messages) {
      seenMessageIds.add(message.id)
    }

    seenMessageIdsByThreadRef.current.set(activeThreadId, seenMessageIds)
    if (latestTimelinePoint) {
      latestTimelinePointByThreadRef.current.set(
        activeThreadId,
        latestTimelinePoint,
      )
    }
    previousThreadIdRef.current = activeThreadId

    if (shouldPlaySound) {
      playSound()
    }
  }, [activeThreadId, enabled, messages, playSound])
}
