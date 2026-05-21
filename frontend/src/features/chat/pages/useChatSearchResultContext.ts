import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useState,
} from 'react'

import { getChatThreadMessageContext } from '../api/chatClient'
import type {
  ChatMessage,
  ChatMessageContextDirection,
  ChatMessageContextResponse,
  ChatSearchResult,
} from '../types'

const HISTORY_FRAGMENT_ERROR_MESSAGE =
  'Не удалось открыть это место в чате. Попробуйте еще раз.'

export type ChatHistoryFragmentState = {
  earlierCursor: number | null
  errorMessage: string | null
  hasMoreEarlier: boolean
  hasMoreLater: boolean
  isLoadingEarlier: boolean
  isLoadingLater: boolean
  laterCursor: number | null
  messages: ChatMessage[]
  targetMessageId: number
}

type UseChatSearchResultContextOptions = {
  handleConnectionUnavailableError: (error: unknown) => boolean
  handleUnauthorizedChatError: (error: unknown) => Promise<boolean>
  isBrowserOnline: boolean
  isMountedRef: MutableRefObject<boolean>
  markBrowserOnline: () => void
  selectedThreadId: string | null
  setHistoryErrorMessage: Dispatch<SetStateAction<string | null>>
}

function sortMessagesByTimeline(messages: ChatMessage[]) {
  return [...messages].sort((left, right) => {
    const leftTime = new Date(left.createdAt).getTime()
    const rightTime = new Date(right.createdAt).getTime()

    if (leftTime !== rightTime) {
      return leftTime - rightTime
    }

    return left.id - right.id
  })
}

function mergeHistoryFragmentMessages({
  currentMessages,
  nextMessages,
}: {
  currentMessages: ChatMessage[]
  nextMessages: ChatMessage[]
}) {
  const messagesById = new Map(
    currentMessages.map((message) => [message.id, message]),
  )

  for (const message of nextMessages) {
    messagesById.set(message.id, message)
  }

  return sortMessagesByTimeline([...messagesById.values()])
}

function createHistoryFragmentFromContext(
  context: ChatMessageContextResponse,
): ChatHistoryFragmentState {
  return {
    earlierCursor: context.earlierCursor,
    errorMessage: null,
    hasMoreEarlier: context.hasMoreEarlier,
    hasMoreLater: context.hasMoreLater,
    isLoadingEarlier: false,
    isLoadingLater: false,
    laterCursor: context.laterCursor,
    messages: context.messages,
    targetMessageId: context.targetMessageId,
  }
}

function stopFragmentLoading(fragment: ChatHistoryFragmentState) {
  return {
    ...fragment,
    isLoadingEarlier: false,
    isLoadingLater: false,
  }
}

export function useChatSearchResultContext({
  handleConnectionUnavailableError,
  handleUnauthorizedChatError,
  isBrowserOnline,
  isMountedRef,
  markBrowserOnline,
  selectedThreadId,
  setHistoryErrorMessage,
}: UseChatSearchResultContextOptions) {
  const [historyFragment, setHistoryFragment] =
    useState<ChatHistoryFragmentState | null>(null)

  const clearHistoryFragment = useCallback(() => {
    setHistoryFragment(null)
  }, [])

  const openSearchResultContext = useCallback(
    async (result: ChatSearchResult) => {
      if (!isBrowserOnline || !selectedThreadId) {
        return false
      }

      try {
        const context = await getChatThreadMessageContext({
          messageId: result.messageId,
          threadId: selectedThreadId,
        })

        if (!isMountedRef.current) {
          return false
        }

        if (
          context.result !== 'ready' ||
          context.activeThread?.id !== selectedThreadId
        ) {
          setHistoryFragment(null)
          setHistoryErrorMessage(HISTORY_FRAGMENT_ERROR_MESSAGE)
          return false
        }

        markBrowserOnline()
        setHistoryErrorMessage(null)
        setHistoryFragment(createHistoryFragmentFromContext(context))

        return true
      } catch (error) {
        if (!isMountedRef.current) {
          return false
        }

        if (await handleUnauthorizedChatError(error)) {
          return false
        }

        handleConnectionUnavailableError(error)
        setHistoryErrorMessage(HISTORY_FRAGMENT_ERROR_MESSAGE)

        return false
      }
    },
    [
      handleConnectionUnavailableError,
      handleUnauthorizedChatError,
      isBrowserOnline,
      isMountedRef,
      markBrowserOnline,
      selectedThreadId,
      setHistoryErrorMessage,
    ],
  )

  const loadHistoryFragmentContext = useCallback(
    async (direction: Exclude<ChatMessageContextDirection, 'initial'>) => {
      if (!historyFragment || !isBrowserOnline || !selectedThreadId) {
        return
      }

      const cursorMessageId =
        direction === 'earlier'
          ? historyFragment.earlierCursor
          : historyFragment.laterCursor

      if (!cursorMessageId) {
        return
      }

      const targetMessageId = historyFragment.targetMessageId

      setHistoryFragment((currentFragment) =>
        currentFragment?.targetMessageId === targetMessageId
          ? {
              ...currentFragment,
              errorMessage: null,
              isLoadingEarlier:
                direction === 'earlier'
                  ? true
                  : currentFragment.isLoadingEarlier,
              isLoadingLater:
                direction === 'later' ? true : currentFragment.isLoadingLater,
            }
          : currentFragment,
      )

      try {
        const context = await getChatThreadMessageContext({
          cursorMessageId,
          direction,
          messageId: targetMessageId,
          threadId: selectedThreadId,
        })

        if (!isMountedRef.current) {
          return
        }

        if (
          context.result !== 'ready' ||
          context.activeThread?.id !== selectedThreadId
        ) {
          setHistoryFragment((currentFragment) =>
            currentFragment
              ? {
                  ...stopFragmentLoading(currentFragment),
                  errorMessage: HISTORY_FRAGMENT_ERROR_MESSAGE,
                }
              : currentFragment,
          )
          return
        }

        markBrowserOnline()
        setHistoryFragment((currentFragment) => {
          if (
            !currentFragment ||
            currentFragment.targetMessageId !== targetMessageId
          ) {
            return currentFragment
          }

          return {
            ...currentFragment,
            earlierCursor:
              direction === 'earlier'
                ? context.earlierCursor
                : currentFragment.earlierCursor,
            errorMessage: null,
            hasMoreEarlier:
              direction === 'earlier'
                ? context.hasMoreEarlier
                : currentFragment.hasMoreEarlier,
            hasMoreLater:
              direction === 'later'
                ? context.hasMoreLater
                : currentFragment.hasMoreLater,
            isLoadingEarlier: false,
            isLoadingLater: false,
            laterCursor:
              direction === 'later'
                ? context.laterCursor
                : currentFragment.laterCursor,
            messages: mergeHistoryFragmentMessages({
              currentMessages: currentFragment.messages,
              nextMessages: context.messages,
            }),
          }
        })
      } catch (error) {
        if (!isMountedRef.current) {
          return
        }

        const wasUnauthorized = await handleUnauthorizedChatError(error)

        if (!wasUnauthorized) {
          handleConnectionUnavailableError(error)
        }

        setHistoryFragment((currentFragment) =>
          currentFragment
            ? {
                ...stopFragmentLoading(currentFragment),
                errorMessage: wasUnauthorized
                  ? currentFragment.errorMessage
                  : HISTORY_FRAGMENT_ERROR_MESSAGE,
              }
            : currentFragment,
        )
      }
    },
    [
      handleConnectionUnavailableError,
      handleUnauthorizedChatError,
      historyFragment,
      isBrowserOnline,
      isMountedRef,
      markBrowserOnline,
      selectedThreadId,
    ],
  )

  return {
    clearHistoryFragment,
    historyFragment,
    loadHistoryFragmentContext,
    openSearchResultContext,
  }
}
