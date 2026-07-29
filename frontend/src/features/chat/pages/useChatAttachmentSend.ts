import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useState,
} from 'react'

import { sendChatAttachments } from '../api/chatClient'
import type { SendAttachmentBatchInput } from '../components/message-composer/types'
import { buildSnapshotFromSendResult } from '../lib/chatSnapshot'
import {
  ONLINE_CHAT_PAGE_CACHE_STATE,
  type ChatPageState,
} from './chatPageState'
import { withChatRecoveryRequestTimeout } from './chatRecoveryRequestTimeout'

type UseChatAttachmentSendOptions = {
  handleConnectionUnavailableError: (error: unknown) => boolean
  handleUnauthorizedChatError: (error: unknown) => Promise<boolean>
  isBrowserOnline: boolean
  isMountedRef: MutableRefObject<boolean>
  markBrowserOnline: () => void
  onAttachmentSendStarted?: () => void
  pageState: ChatPageState
  setPageState: Dispatch<SetStateAction<ChatPageState>>
}

export function useChatAttachmentSend({
  handleConnectionUnavailableError,
  handleUnauthorizedChatError,
  isBrowserOnline,
  isMountedRef,
  markBrowserOnline,
  onAttachmentSendStarted,
  pageState,
  setPageState,
}: UseChatAttachmentSendOptions) {
  const [isSending, setIsSending] = useState(false)
  const [sendErrorMessage, setSendErrorMessage] = useState<string | null>(null)

  const clearSendError = useCallback(() => {
    setSendErrorMessage(null)
  }, [])

  const handleSendAttachmentBatch = useCallback(
    async ({
      clientMessageKey,
      content,
      items,
      replyToMessageId,
    }: SendAttachmentBatchInput) => {
      if (
        !isBrowserOnline ||
        pageState.status !== 'ready' ||
        !pageState.selectedThreadId
      ) {
        return false
      }

      const threadId = pageState.selectedThreadId

      onAttachmentSendStarted?.()
      setIsSending(true)
      setSendErrorMessage(null)

      try {
        const sendResult = await withChatRecoveryRequestTimeout((signal) =>
          sendChatAttachments({
            attachments: items.map(({ file }) => file),
            clientMessageKey,
            content,
            replyToMessageId,
            signal,
            threadId,
          }),
        )

        if (!isMountedRef.current) {
          return false
        }

        if (
          sendResult.result !== 'ready' ||
          !sendResult.sentMessage ||
          sendResult.activeThread?.id !== threadId
        ) {
          setSendErrorMessage('Не удалось отправить файл. Попробуйте еще раз.')
          return false
        }

        markBrowserOnline()
        setPageState((currentState) => {
          if (currentState.selectedThreadId !== threadId) {
            return currentState
          }

          const currentSnapshot =
            currentState.status === 'ready' ? currentState.snapshot : null

          return {
            ...ONLINE_CHAT_PAGE_CACHE_STATE,
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

        if (handleConnectionUnavailableError(error)) {
          return false
        }

        setSendErrorMessage(
          error instanceof Error
            ? error.message
            : 'Не удалось отправить файл. Попробуйте еще раз.',
        )

        return false
      } finally {
        if (isMountedRef.current) {
          setIsSending(false)
        }
      }
    },
    [
      handleConnectionUnavailableError,
      handleUnauthorizedChatError,
      isBrowserOnline,
      isMountedRef,
      markBrowserOnline,
      onAttachmentSendStarted,
      pageState.selectedThreadId,
      pageState.status,
      setPageState,
    ],
  )

  return {
    clearSendError,
    handleSendAttachmentBatch,
    isSending,
    sendErrorMessage,
    setSendErrorMessage,
  }
}
