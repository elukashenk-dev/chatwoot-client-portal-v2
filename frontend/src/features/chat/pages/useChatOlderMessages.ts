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
import { withChatRecoveryRequestTimeout } from './chatRecoveryRequestTimeout'
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
    const readCachedOlderSnapshot = () =>
      tenantSlug && userId !== null
        ? readOfflineOlderMessagePage({
            pageCursor,
            tenantSlug,
            threadId,
            userId,
          })
        : null
    const mergeCachedOlderSnapshot = (
      cachedOlderSnapshot: Awaited<ReturnType<typeof readCachedOlderSnapshot>>,
    ) => {
      if (!cachedOlderSnapshot) {
        return false
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

      return true
    }

    if (!isBrowserOnline) {
      const cachedOlderSnapshot = await readCachedOlderSnapshot()

      if (!isMountedRef.current) {
        return
      }

      if (!mergeCachedOlderSnapshot(cachedOlderSnapshot)) {
        setHistoryErrorMessage(
          'Более ранние сообщения не сохранены на этом устройстве.',
        )
        setIsLoadingOlder(false)
        return
      }

      setIsLoadingOlder(false)
      return
    }

    try {
      const olderSnapshot = await withChatRecoveryRequestTimeout((signal) =>
        getChatMessages({
          beforeMessageId,
          signal,
          threadId,
        }),
      )

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

      if (handleConnectionUnavailableError(error)) {
        const cachedOlderSnapshot = await readCachedOlderSnapshot()

        if (!isMountedRef.current) {
          return
        }

        if (mergeCachedOlderSnapshot(cachedOlderSnapshot)) {
          return
        }

        setHistoryErrorMessage(
          'Более ранние сообщения не сохранены на этом устройстве.',
        )
        return
      }

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
