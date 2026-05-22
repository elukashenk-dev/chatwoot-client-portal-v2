import { useEffect, useRef } from 'react'

import type { ChatMessage } from '../types'

type UseChatNotificationSoundOptions = {
  activeThreadId: string | null
  enabled: boolean
  messages: ChatMessage[]
  playSound?: () => void
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

  useEffect(() => {
    if (!activeThreadId) {
      previousThreadIdRef.current = null
      return
    }

    const seenMessageIds =
      seenMessageIdsByThreadRef.current.get(activeThreadId) ?? new Set<number>()
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
          message.authorRole !== 'current_user',
      )

    for (const message of messages) {
      seenMessageIds.add(message.id)
    }

    seenMessageIdsByThreadRef.current.set(activeThreadId, seenMessageIds)
    previousThreadIdRef.current = activeThreadId

    if (shouldPlaySound) {
      playSound()
    }
  }, [activeThreadId, enabled, messages, playSound])
}
