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
  getSnapshotPrimaryConversationId,
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
}: UseOptimisticTextSendInput) {
  const optimisticMessageIdRef = useRef(-1)
  const [optimisticTextSends, setOptimisticTextSends] = useState<
    OptimisticTextSend[]
  >([])

  const markOptimisticTextSendFailed = useCallback(
    (clientMessageKey: string, errorMessage: string) => {
      setOptimisticTextSends((currentSends) =>
        currentSends.map((send) =>
          send.clientMessageKey === clientMessageKey
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
          primaryConversationId: optimisticSend.primaryConversationId,
          replyToMessageId: optimisticSend.replyToMessageId,
        })

        if (!isMountedRef.current) {
          return false
        }

        if (sendResult.result !== 'ready' || !sendResult.sentMessage) {
          markOptimisticTextSendFailed(
            optimisticSend.clientMessageKey,
            DEFAULT_TEXT_SEND_ERROR_MESSAGE,
          )
          return false
        }

        markBrowserOnline()
        setOptimisticTextSends((currentSends) =>
          currentSends.filter(
            (send) => send.clientMessageKey !== optimisticSend.clientMessageKey,
          ),
        )
        setPageState((currentState) => {
          const currentSnapshot =
            currentState.status === 'ready' ? currentState.snapshot : null

          return {
            snapshot: buildSnapshotFromSendResult({
              currentSnapshot,
              sendResult,
            }),
            status: 'ready',
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
        primaryConversationId: getSnapshotPrimaryConversationId(
          pageState.snapshot,
        ),
        replyTarget,
        replyToMessageId: replyToMessageId ?? null,
      })

      onTextSendStarted?.()
      optimisticMessageIdRef.current -= 1
      setOptimisticTextSends((currentSends) => [
        ...currentSends.filter(
          (send) => send.clientMessageKey !== clientMessageKey,
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
    ],
  )

  const handleRetryTextMessage = useCallback(
    (clientMessageKey: string) => {
      if (!isBrowserOnline) {
        return
      }

      const optimisticSend = optimisticTextSends.find(
        (send) => send.clientMessageKey === clientMessageKey,
      )

      if (!optimisticSend || optimisticSend.status === 'sending') {
        return
      }

      const retrySend = {
        ...optimisticSend,
        errorMessage: null,
        primaryConversationId:
          getSnapshotPrimaryConversationId(
            pageState.status === 'ready' ? pageState.snapshot : null,
          ) ?? optimisticSend.primaryConversationId,
        status: 'sending' as const,
      }

      setOptimisticTextSends((currentSends) =>
        currentSends.map((send) =>
          send.clientMessageKey === clientMessageKey ? retrySend : send,
        ),
      )
      void sendOptimisticText(retrySend)
    },
    [isBrowserOnline, optimisticTextSends, pageState, sendOptimisticText],
  )

  return {
    handleRetryTextMessage,
    handleSendMessage,
    optimisticTextSends,
  }
}
