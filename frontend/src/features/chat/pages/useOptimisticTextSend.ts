import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'

import { sendChatMessage } from '../api/chatClient'
import { buildSnapshotFromSendResult } from '../lib/chatSnapshot'
import {
  createOptimisticTextSend,
  type OptimisticTextSend,
} from '../lib/optimisticTextMessages'
import type { MessageComposerReplyTarget } from '../components/MessageComposer'
import type { ChatPageState } from './chatPageState'

const DEFAULT_TEXT_SEND_ERROR_MESSAGE =
  'Не удалось отправить сообщение. Попробуйте еще раз.'

type TextSendInput = {
  clientMessageKey: string
  content: string
  replyToMessageId?: number | null
}

type UseOptimisticTextSendInput = {
  handleConnectionUnavailableError: (error: unknown) => boolean
  handleUnauthorizedChatError: (error: unknown) => Promise<boolean>
  isBrowserOnline: boolean
  isMountedRef: MutableRefObject<boolean>
  markBrowserOnline: () => void
  onTextSendStarted?: () => void
  pageState: ChatPageState
  replyTarget: MessageComposerReplyTarget | null
  setPageState: Dispatch<SetStateAction<ChatPageState>>
  threadId: string
}

function getTextSendErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : DEFAULT_TEXT_SEND_ERROR_MESSAGE
}

export function useOptimisticTextSend({
  handleConnectionUnavailableError,
  handleUnauthorizedChatError,
  isBrowserOnline,
  isMountedRef,
  markBrowserOnline,
  onTextSendStarted,
  pageState,
  replyTarget,
  setPageState,
  threadId,
}: UseOptimisticTextSendInput) {
  const optimisticMessageIdRef = useRef(-1)
  const [optimisticTextSends, setOptimisticTextSends] = useState<
    OptimisticTextSend[]
  >([])

  const markOptimisticTextSendFailed = useCallback(
    (clientMessageKey: string, threadId: string, errorMessage: string) => {
      setOptimisticTextSends((currentSends) =>
        currentSends.map((send) =>
          send.clientMessageKey === clientMessageKey &&
          send.threadId === threadId
            ? {
                ...send,
                errorMessage,
                status: 'failed',
              }
            : send,
        ),
      )
    },
    [],
  )

  const sendOptimisticText = useCallback(
    async (optimisticSend: OptimisticTextSend) => {
      try {
        const sendResult = await sendChatMessage({
          clientMessageKey: optimisticSend.clientMessageKey,
          content: optimisticSend.content,
          replyToMessageId: optimisticSend.replyToMessageId,
          threadId: optimisticSend.threadId,
        })

        if (!isMountedRef.current) {
          return false
        }

        if (sendResult.result !== 'ready' || !sendResult.sentMessage) {
          markOptimisticTextSendFailed(
            optimisticSend.clientMessageKey,
            optimisticSend.threadId,
            DEFAULT_TEXT_SEND_ERROR_MESSAGE,
          )
          return false
        }

        if (sendResult.activeThread?.id !== optimisticSend.threadId) {
          markOptimisticTextSendFailed(
            optimisticSend.clientMessageKey,
            optimisticSend.threadId,
            DEFAULT_TEXT_SEND_ERROR_MESSAGE,
          )
          return false
        }

        markBrowserOnline()
        setOptimisticTextSends((currentSends) =>
          currentSends.filter(
            (send) =>
              send.clientMessageKey !== optimisticSend.clientMessageKey ||
              send.threadId !== optimisticSend.threadId,
          ),
        )
        setPageState((currentState) => {
          if (currentState.selectedThreadId !== optimisticSend.threadId) {
            return currentState
          }

          const currentSnapshot =
            currentState.status === 'ready' ? currentState.snapshot : null

          return {
            snapshot: buildSnapshotFromSendResult({
              currentSnapshot,
              sendResult,
            }),
            selectedThreadId: currentState.selectedThreadId,
            status: 'ready',
            threads: currentState.threads,
          }
        })

        return true
      } catch (error) {
        if (!isMountedRef.current) {
          return false
        }

        if (await handleUnauthorizedChatError(error)) {
          return false
        }

        handleConnectionUnavailableError(error)
        markOptimisticTextSendFailed(
          optimisticSend.clientMessageKey,
          optimisticSend.threadId,
          getTextSendErrorMessage(error),
        )

        return false
      }
    },
    [
      handleConnectionUnavailableError,
      handleUnauthorizedChatError,
      isMountedRef,
      markBrowserOnline,
      markOptimisticTextSendFailed,
      setPageState,
    ],
  )

  const handleSendMessage = useCallback(
    async ({ clientMessageKey, content, replyToMessageId }: TextSendInput) => {
      if (!isBrowserOnline || pageState.status !== 'ready') {
        return false
      }

      const optimisticSend = createOptimisticTextSend({
        clientMessageKey,
        content,
        id: optimisticMessageIdRef.current,
        now: new Date(),
        replyTarget,
        replyToMessageId: replyToMessageId ?? null,
        threadId,
      })

      onTextSendStarted?.()
      optimisticMessageIdRef.current -= 1
      setOptimisticTextSends((currentSends) => [
        ...currentSends.filter(
          (send) =>
            send.clientMessageKey !== clientMessageKey ||
            send.threadId !== threadId,
        ),
        optimisticSend,
      ])

      void sendOptimisticText(optimisticSend)

      return true
    },
    [
      isBrowserOnline,
      onTextSendStarted,
      pageState,
      replyTarget,
      sendOptimisticText,
      threadId,
    ],
  )

  const handleRetryTextMessage = useCallback(
    (clientMessageKey: string) => {
      if (!isBrowserOnline) {
        return
      }

      const optimisticSend = optimisticTextSends.find(
        (send) =>
          send.clientMessageKey === clientMessageKey &&
          send.threadId === threadId,
      )

      if (!optimisticSend || optimisticSend.status === 'sending') {
        return
      }

      const retrySend = {
        ...optimisticSend,
        errorMessage: null,
        status: 'sending' as const,
      }

      setOptimisticTextSends((currentSends) =>
        currentSends.map((send) =>
          send.clientMessageKey === clientMessageKey && send.threadId === threadId
            ? retrySend
            : send,
        ),
      )
      void sendOptimisticText(retrySend)
    },
    [
      isBrowserOnline,
      optimisticTextSends,
      sendOptimisticText,
      threadId,
    ],
  )

  return {
    handleRetryTextMessage,
    handleSendMessage,
    optimisticTextSends,
  }
}
