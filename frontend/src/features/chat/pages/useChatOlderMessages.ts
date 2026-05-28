import {
  useCallback,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'

import { getChatMessages } from '../api/chatClient'
import { mergeOlderMessages } from '../lib/chatSnapshot'
import {
  ONLINE_CHAT_PAGE_CACHE_STATE,
  type ChatPageState,
} from './chatPageState'

type UseChatOlderMessagesInput = {
  handleConnectionUnavailableError: (error: unknown) => boolean
  handleUnauthorizedChatError: (error: unknown) => Promise<boolean>
  isBrowserOnline: boolean
  isMountedRef: MutableRefObject<boolean>
  markBrowserOnline: () => void
  pageState: ChatPageState
  setHistoryErrorMessage: Dispatch<SetStateAction<string | null>>
  setPageState: Dispatch<SetStateAction<ChatPageState>>
}

export function useChatOlderMessages({
  handleConnectionUnavailableError,
  handleUnauthorizedChatError,
  isBrowserOnline,
  isMountedRef,
  markBrowserOnline,
  pageState,
  setHistoryErrorMessage,
  setPageState,
}: UseChatOlderMessagesInput) {
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)

  const handleLoadOlderMessages = useCallback(async () => {
    if (
      !isBrowserOnline ||
      pageState.status !== 'ready' ||
      !pageState.snapshot.activeThread ||
      !pageState.selectedThreadId ||
      !pageState.snapshot.nextOlderCursor
    ) {
      return
    }

    setIsLoadingOlder(true)
    setHistoryErrorMessage(null)
    const threadId = pageState.selectedThreadId

    try {
      const olderSnapshot = await getChatMessages({
        beforeMessageId: pageState.snapshot.nextOlderCursor,
        threadId,
      })

      if (!isMountedRef.current) {
        return
      }

      if (olderSnapshot.result !== 'ready') {
        setHistoryErrorMessage(
          'Не удалось загрузить более ранние сообщения. Попробуйте еще раз.',
        )

        return
      }

      markBrowserOnline()
      setPageState((currentState) => {
        if (
          currentState.status !== 'ready' ||
          currentState.selectedThreadId !== threadId ||
          olderSnapshot.activeThread?.id !== threadId
        ) {
          return currentState
        }

        return {
          ...ONLINE_CHAT_PAGE_CACHE_STATE,
          snapshot: mergeOlderMessages(currentState.snapshot, olderSnapshot),
          selectedThreadId: currentState.selectedThreadId,
          status: 'ready',
          threads: currentState.threads,
        }
      })
    } catch (error) {
      if (!isMountedRef.current) {
        return
      }

      if (await handleUnauthorizedChatError(error)) {
        return
      }

      handleConnectionUnavailableError(error)

      setHistoryErrorMessage(
        'Не удалось загрузить более ранние сообщения. Попробуйте еще раз.',
      )
    } finally {
      if (isMountedRef.current) {
        setIsLoadingOlder(false)
      }
    }
  }, [
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
    isBrowserOnline,
    isMountedRef,
    markBrowserOnline,
    pageState,
    setHistoryErrorMessage,
    setPageState,
  ])

  return {
    handleLoadOlderMessages,
    isLoadingOlder,
  }
}
