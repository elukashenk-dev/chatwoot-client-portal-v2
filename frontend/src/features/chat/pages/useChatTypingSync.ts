import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

const TYPING_IDLE_OFF_MS = 2_500
const TYPING_ON_RESEND_MS = 3_000

type SetTypingInput = {
  threadId: string
  typingStatus: 'off' | 'on'
}

export function useChatTypingSync({
  canUseBackend,
  selectedThreadId,
  setTyping,
}: {
  canUseBackend: boolean
  selectedThreadId: string | null
  setTyping: (input: SetTypingInput) => Promise<void>
}) {
  const canUseBackendRef = useRef(canUseBackend)
  const lastOnSentAtRef = useRef(0)
  const offTimerRef = useRef<number | null>(null)
  const typingThreadRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    canUseBackendRef.current = canUseBackend
  }, [canUseBackend])

  const clearOffTimer = useCallback(() => {
    if (offTimerRef.current !== null) {
      window.clearTimeout(offTimerRef.current)
      offTimerRef.current = null
    }
  }, [])

  const sendTypingOff = useCallback(() => {
    const threadId = typingThreadRef.current

    clearOffTimer()

    if (!threadId) {
      return
    }

    typingThreadRef.current = null
    lastOnSentAtRef.current = 0

    if (!canUseBackendRef.current) {
      return
    }

    void setTyping({ threadId, typingStatus: 'off' }).catch(() => {})
  }, [clearOffTimer, setTyping])

  const handleDraftChanged = useCallback(
    (draft: string) => {
      if (!canUseBackend || !selectedThreadId || !draft.trim()) {
        sendTypingOff()
        return
      }

      if (
        typingThreadRef.current &&
        typingThreadRef.current !== selectedThreadId
      ) {
        sendTypingOff()
      }

      const now = Date.now()

      typingThreadRef.current = selectedThreadId

      if (now - lastOnSentAtRef.current >= TYPING_ON_RESEND_MS) {
        lastOnSentAtRef.current = now
        void setTyping({
          threadId: selectedThreadId,
          typingStatus: 'on',
        }).catch(() => {})
      }

      clearOffTimer()
      offTimerRef.current = window.setTimeout(sendTypingOff, TYPING_IDLE_OFF_MS)
    },
    [canUseBackend, clearOffTimer, selectedThreadId, sendTypingOff, setTyping],
  )

  useEffect(() => {
    if (
      typingThreadRef.current &&
      typingThreadRef.current !== selectedThreadId
    ) {
      sendTypingOff()
    }
  }, [selectedThreadId, sendTypingOff])

  useEffect(() => {
    return () => {
      sendTypingOff()
    }
  }, [sendTypingOff])

  return { handleDraftChanged, sendTypingOff }
}
