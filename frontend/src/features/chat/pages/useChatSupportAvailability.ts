import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

import { getChatSupportAvailability } from '../api/chatClient'
import type { ChatSupportAvailabilityResponse } from '../types'

const SUPPORT_AVAILABILITY_POLL_MS = 30_000

type UseChatSupportAvailabilityOptions = {
  handleConnectionUnavailableError: (error: unknown) => boolean
  handleUnauthorizedChatError: (error: unknown) => Promise<boolean>
  isBrowserOnline: boolean
  isMountedRef: RefObject<boolean>
  markBrowserOnline: () => void
}

export type ChatSupportAvailabilityState = {
  availability: ChatSupportAvailabilityResponse | null
  isLoading: boolean
}

export function useChatSupportAvailability({
  handleConnectionUnavailableError,
  handleUnauthorizedChatError,
  isBrowserOnline,
  isMountedRef,
  markBrowserOnline,
}: UseChatSupportAvailabilityOptions) {
  const requestSequenceRef = useRef(0)
  const latestOptionsRef = useRef({
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
    isMountedRef,
    markBrowserOnline,
  })
  const [state, setState] = useState<ChatSupportAvailabilityState>({
    availability: null,
    isLoading: true,
  })

  useEffect(() => {
    latestOptionsRef.current = {
      handleConnectionUnavailableError,
      handleUnauthorizedChatError,
      isMountedRef,
      markBrowserOnline,
    }
  }, [
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
    isMountedRef,
    markBrowserOnline,
  ])

  const loadSupportAvailability = useCallback(async () => {
    const requestId = requestSequenceRef.current + 1
    requestSequenceRef.current = requestId
    setState((currentState) => ({
      ...currentState,
      isLoading: currentState.availability === null,
    }))

    const isCurrentRequest = () =>
      latestOptionsRef.current.isMountedRef.current &&
      requestSequenceRef.current === requestId

    try {
      const availability = await getChatSupportAvailability()

      if (!isCurrentRequest()) {
        return
      }

      latestOptionsRef.current.markBrowserOnline()
      setState({
        availability,
        isLoading: false,
      })
    } catch (error) {
      if (!isCurrentRequest()) {
        return
      }

      if (await latestOptionsRef.current.handleUnauthorizedChatError(error)) {
        if (isCurrentRequest()) {
          setState((currentState) => ({
            ...currentState,
            isLoading: false,
          }))
        }
        return
      }

      latestOptionsRef.current.handleConnectionUnavailableError(error)

      if (!isCurrentRequest()) {
        return
      }

      setState((currentState) => ({
        ...currentState,
        isLoading: false,
      }))
    }
  }, [])

  useEffect(() => {
    if (!isBrowserOnline) {
      return
    }

    const initialLoadTimerId = window.setTimeout(() => {
      void loadSupportAvailability()
    }, 0)
    const intervalId = window.setInterval(() => {
      void loadSupportAvailability()
    }, SUPPORT_AVAILABILITY_POLL_MS)

    return () => {
      window.clearTimeout(initialLoadTimerId)
      window.clearInterval(intervalId)
      requestSequenceRef.current += 1
    }
  }, [isBrowserOnline, loadSupportAvailability])

  return {
    loadSupportAvailability,
    state,
  }
}
