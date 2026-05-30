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
import {
  readOfflineOlderMessagePage,
  saveOfflineOlderMessagePage,
} from './offlineChatCache'

type UseChatOlderMessagesInput = {
  handleConnectionUnavailableError: (error: unknown) => boolean
  handleUnauthorizedChatError: (error: unknown) => Promise<boolean>
  isBrowserOnline: boolean
  isMountedRef: MutableRefObject<boolean>
  markBrowserOnline: () => void
  pageState: ChatPageState
  setHistoryErrorMessage: Dispatch<SetStateAction<string | null>>
  setPageState: Dispatch<SetStateAction<ChatPageState>>
  tenantSlug: string | null
  userId: number | null
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
  tenantSlug,
  userId,
}: UseChatOlderMessagesInput) {
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)

  const handleLoadOlderMessages = useCallback(async () => {
    if (
      pageState.status !== 'ready' ||
      !pageState.snapshot.activeThread ||
      !pageState.selectedThreadId ||
      !pageState.snapshot.nextOlderCursor
    ) {
      return
    }

    setIsLoadingOlder(true)
    setHistoryErrorMessage(null)
    const beforeMessageId = pageState.snapshot.nextOlderCursor
    const pageCursor = `before:${beforeMessageId}` as const
    const threadId = pageState.selectedThreadId

    if (!isBrowserOnline) {
      const cachedOlderSnapshot =
        tenantSlug && userId !== null
          ? await readOfflineOlderMessagePage({
              pageCursor,
              tenantSlug,
              threadId,
              userId,
            })
          : null

      if (!isMountedRef.current) {
        return
      }

      if (!cachedOlderSnapshot) {
        setHistoryErrorMessage(
          'Более ранние сообщения не сохранены на этом устройстве.',
        )
        setIsLoadingOlder(false)
        return
      }

      setPageState((currentState) => {
        if (
          currentState.status !== 'ready' ||
          currentState.selectedThreadId !== threadId ||
          cachedOlderSnapshot.activeThread?.id !== threadId
        ) {
          return currentState
        }

        return {
          ...currentState,
          snapshot: mergeOlderMessages(
            currentState.snapshot,
            cachedOlderSnapshot,
          ),
        }
      })
      setIsLoadingOlder(false)
      return
    }

    try {
      const olderSnapshot = await getChatMessages({
        beforeMessageId,
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

      if (tenantSlug && userId !== null) {
        void saveOfflineOlderMessagePage({
          pageCursor,
          snapshot: olderSnapshot,
          tenantSlug,
          threadId,
          userId,
        }).catch(() => undefined)
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
    tenantSlug,
    userId,
  ])

  return {
    handleLoadOlderMessages,
    isLoadingOlder,
  }
}
