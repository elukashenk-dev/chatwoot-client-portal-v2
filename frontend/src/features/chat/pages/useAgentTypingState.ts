import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ChatTypingEvent } from '../api/chatRealtimeClient'

// Chatwoot sends one agent typing_on at typing start, then keeps resetting
// its own idle timer without sending keepalive webhooks while the agent types.
// This fallback is only for missed typing_off events; normal typing_off clears
// the indicator immediately.
const AGENT_TYPING_AUTO_CLEAR_MS = 60_000

type AgentTypingState = {
  isTyping: boolean
  scope: AgentTypingScope | null
  threadId: string | null
}

type AgentTypingScope = {
  realtimeThreadId: string | null
  selectedThreadId: string | null
}

const EMPTY_AGENT_TYPING_STATE: AgentTypingState = {
  isTyping: false,
  scope: null,
  threadId: null,
}

export function useAgentTypingState({
  realtimeThreadId,
  selectedThreadId,
}: {
  realtimeThreadId: string | null
  selectedThreadId: string | null
}) {
  const [agentTyping, setAgentTyping] = useState<AgentTypingState>(
    EMPTY_AGENT_TYPING_STATE,
  )
  const autoClearTimerRef = useRef<number | null>(null)
  const scope = useMemo<AgentTypingScope>(
    () => ({
      realtimeThreadId,
      selectedThreadId,
    }),
    [realtimeThreadId, selectedThreadId],
  )

  const clearAutoClearTimer = useCallback(() => {
    if (autoClearTimerRef.current !== null) {
      window.clearTimeout(autoClearTimerRef.current)
      autoClearTimerRef.current = null
    }
  }, [])

  const clearAgentTyping = useCallback(() => {
    clearAutoClearTimer()
    setAgentTyping(EMPTY_AGENT_TYPING_STATE)
  }, [clearAutoClearTimer])

  const handleAgentTyping = useCallback(
    (event: ChatTypingEvent) => {
      if (
        event.actor !== 'agent' ||
        event.threadId !== selectedThreadId ||
        event.threadId !== realtimeThreadId
      ) {
        return
      }

      if (!event.isTyping) {
        clearAgentTyping()
        return
      }

      clearAutoClearTimer()
      setAgentTyping({
        isTyping: true,
        scope,
        threadId: event.threadId,
      })
      autoClearTimerRef.current = window.setTimeout(
        clearAgentTyping,
        AGENT_TYPING_AUTO_CLEAR_MS,
      )
    },
    [
      clearAgentTyping,
      clearAutoClearTimer,
      realtimeThreadId,
      scope,
      selectedThreadId,
    ],
  )

  useEffect(() => {
    clearAutoClearTimer()
  }, [clearAutoClearTimer, realtimeThreadId, selectedThreadId])

  useEffect(() => {
    return () => {
      clearAutoClearTimer()
    }
  }, [clearAutoClearTimer])

  const isAgentTypingVisible = useMemo(
    () =>
      agentTyping.isTyping &&
      agentTyping.scope === scope &&
      agentTyping.threadId === selectedThreadId &&
      agentTyping.threadId === realtimeThreadId,
    [
      agentTyping.isTyping,
      agentTyping.scope,
      agentTyping.threadId,
      realtimeThreadId,
      scope,
      selectedThreadId,
    ],
  )

  return {
    handleAgentTyping,
    isAgentTypingVisible,
  }
}
