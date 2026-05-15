import {
  useCallback,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'

import { getChatMessages, getChatThreads } from '../api/chatClient'
import { PRIVATE_CHAT_THREAD_ID } from '../types'
import type { MessageComposerReplyTarget } from '../components/MessageComposer'
import type { ChatPageState } from './chatPageState'

type UseChatThreadSelectionInput = {
  handleConnectionUnavailableError: (error: unknown) => boolean
  handleUnauthorizedChatError: (error: unknown) => Promise<boolean>
  isMountedRef: MutableRefObject<boolean>
  markBrowserOnline: () => void
  pageState: ChatPageState
  setHistoryErrorMessage: Dispatch<SetStateAction<string | null>>
  setPageState: Dispatch<SetStateAction<ChatPageState>>
  setReplyTarget: Dispatch<SetStateAction<MessageComposerReplyTarget | null>>
  setSendErrorMessage: Dispatch<SetStateAction<string | null>>
}

function getFallbackThreadId(threads: { id: string }[]) {
  return threads[0]?.id ?? PRIVATE_CHAT_THREAD_ID
}

export function useChatThreadSelection({
  handleConnectionUnavailableError,
  handleUnauthorizedChatError,
  isMountedRef,
  markBrowserOnline,
  pageState,
  setHistoryErrorMessage,
  setPageState,
  setReplyTarget,
  setSendErrorMessage,
}: UseChatThreadSelectionInput) {
  const loadRequestIdRef = useRef(0)

  const loadInitialChat = useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1
    loadRequestIdRef.current = requestId

    setHistoryErrorMessage(null)
    setPageState((currentState) => ({
      selectedThreadId: currentState.selectedThreadId,
      snapshot: currentState.snapshot,
      status: 'loading',
      threads: currentState.threads,
    }))

    try {
      const threadsResponse = await getChatThreads()
      const selectedThreadId =
        threadsResponse.activeThreadId ?? getFallbackThreadId(threadsResponse.threads)
      const snapshot = await getChatMessages({ threadId: selectedThreadId })

      if (!isMountedRef.current || loadRequestIdRef.current !== requestId) {
        return
      }

      markBrowserOnline()
      setPageState({
        selectedThreadId,
        snapshot,
        status: 'ready',
        threads: threadsResponse.threads,
      })
    } catch (error) {
      if (!isMountedRef.current || loadRequestIdRef.current !== requestId) {
        return
      }

      if (await handleUnauthorizedChatError(error)) {
        return
      }

      handleConnectionUnavailableError(error)

      setPageState((currentState) => ({
        errorMessage:
          error instanceof Error
            ? error.message
            : 'Мы не смогли загрузить чат. Попробуйте еще раз.',
        selectedThreadId: currentState.selectedThreadId,
        snapshot: null,
        status: 'error',
        threads: currentState.threads,
      }))
    }
  }, [
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
    isMountedRef,
    markBrowserOnline,
    setHistoryErrorMessage,
    setPageState,
  ])

  const handleSelectThread = useCallback(
    async (threadId: string) => {
      if (
        pageState.selectedThreadId === threadId ||
        !pageState.threads.some((thread) => thread.id === threadId)
      ) {
        return
      }

      const requestId = loadRequestIdRef.current + 1
      loadRequestIdRef.current = requestId

      setHistoryErrorMessage(null)
      setReplyTarget(null)
      setSendErrorMessage(null)
      setPageState((currentState) => ({
        selectedThreadId: threadId,
        snapshot: null,
        status: 'loading',
        threads: currentState.threads,
      }))

      try {
        const snapshot = await getChatMessages({ threadId })

        if (!isMountedRef.current || loadRequestIdRef.current !== requestId) {
          return
        }

        markBrowserOnline()
        setPageState((currentState) => ({
          selectedThreadId: threadId,
          snapshot,
          status: 'ready',
          threads: currentState.threads,
        }))
      } catch (error) {
        if (!isMountedRef.current || loadRequestIdRef.current !== requestId) {
          return
        }

        if (await handleUnauthorizedChatError(error)) {
          return
        }

        handleConnectionUnavailableError(error)

        setPageState((currentState) => ({
          errorMessage:
            error instanceof Error
              ? error.message
              : 'Мы не смогли загрузить чат. Попробуйте еще раз.',
          selectedThreadId: threadId,
          snapshot: null,
          status: 'error',
          threads: currentState.threads,
        }))
      }
    },
    [
      handleConnectionUnavailableError,
      handleUnauthorizedChatError,
      isMountedRef,
      markBrowserOnline,
      pageState.selectedThreadId,
      pageState.threads,
      setHistoryErrorMessage,
      setPageState,
      setReplyTarget,
      setSendErrorMessage,
    ],
  )

  return {
    handleSelectThread,
    loadInitialChat,
  }
}
