import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import { ChatApiClientError, sendChatAttachments } from '../api/chatClient'
import type { AttachmentTransferState } from '../api/chatAttachmentTransport'
import type { SendAttachmentBatchInput } from '../components/message-composer/types'
import { buildSnapshotFromSendResult } from '../lib/chatSnapshot'
import {
  ONLINE_CHAT_PAGE_CACHE_STATE,
  type ChatPageState,
} from './chatPageState'

const IDLE_ATTACHMENT_TRANSFER_STATE = {
  percent: null,
  stage: 'idle',
} satisfies AttachmentTransferState
const ATTACHMENT_SEND_ERROR_MESSAGE =
  'Не удалось загрузить файлы. Они остались в сообщении — попробуйте ещё раз.'

function getAttachmentSendErrorMessage(error: unknown) {
  const retryAfterSeconds =
    error instanceof ChatApiClientError ? error.retryAfterSeconds : null

  if (
    retryAfterSeconds !== null &&
    retryAfterSeconds >= 1 &&
    retryAfterSeconds <= 3600
  ) {
    return `${ATTACHMENT_SEND_ERROR_MESSAGE} Попробуйте через ${retryAfterSeconds} сек.`
  }

  return ATTACHMENT_SEND_ERROR_MESSAGE
}

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
  const activeAbortControllerRef = useRef<AbortController | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [sendErrorMessage, setSendErrorMessageState] = useState<string | null>(
    null,
  )
  const [transferState, setTransferState] = useState<AttachmentTransferState>(
    IDLE_ATTACHMENT_TRANSFER_STATE,
  )

  const clearSendError = useCallback(() => {
    setSendErrorMessageState(null)
    setTransferState((currentState) =>
      currentState.stage === 'error'
        ? IDLE_ATTACHMENT_TRANSFER_STATE
        : currentState,
    )
  }, [])
  const setSharedSendErrorMessage = useCallback<
    Dispatch<SetStateAction<string | null>>
  >((nextErrorMessage) => {
    setSendErrorMessageState(nextErrorMessage)
    setTransferState((currentState) =>
      currentState.stage === 'error'
        ? IDLE_ATTACHMENT_TRANSFER_STATE
        : currentState,
    )
  }, [])

  const cancelAttachmentUpload = useCallback(() => {
    const abortController = activeAbortControllerRef.current

    if (!abortController || transferState.stage !== 'uploading') {
      return
    }

    activeAbortControllerRef.current = null
    abortController.abort()
    setIsSending(false)
    setSendErrorMessageState(null)
    setTransferState(IDLE_ATTACHMENT_TRANSFER_STATE)
  }, [transferState.stage])

  useEffect(
    () => () => {
      activeAbortControllerRef.current?.abort()
      activeAbortControllerRef.current = null
    },
    [],
  )

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

      if (activeAbortControllerRef.current) {
        return false
      }

      const threadId = pageState.selectedThreadId
      const abortController = new AbortController()

      activeAbortControllerRef.current = abortController
      onAttachmentSendStarted?.()
      setIsSending(true)
      setSendErrorMessageState(null)
      setTransferState({ percent: 0, stage: 'preparing' })

      try {
        const sendResult = await sendChatAttachments({
          attachments: items.map(({ file }) => file),
          clientMessageKey,
          content,
          onTransferStateChange: (nextTransferState) => {
            if (
              isMountedRef.current &&
              activeAbortControllerRef.current === abortController
            ) {
              setTransferState(nextTransferState)
            }
          },
          replyToMessageId,
          signal: abortController.signal,
          threadId,
        })

        if (!isMountedRef.current) {
          return false
        }

        if (
          sendResult.result !== 'ready' ||
          !sendResult.sentMessage ||
          sendResult.activeThread?.id !== threadId
        ) {
          setSendErrorMessageState(ATTACHMENT_SEND_ERROR_MESSAGE)
          setTransferState({ percent: null, stage: 'error' })
          return false
        }

        markBrowserOnline()
        setTransferState(IDLE_ATTACHMENT_TRANSFER_STATE)
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
        if (abortController.signal.aborted) {
          return false
        }

        if (!isMountedRef.current) {
          return false
        }

        if (await handleUnauthorizedChatError(error)) {
          setSendErrorMessageState(null)
          setTransferState(IDLE_ATTACHMENT_TRANSFER_STATE)
          return false
        }

        setSendErrorMessageState(getAttachmentSendErrorMessage(error))
        setTransferState({ percent: null, stage: 'error' })

        if (handleConnectionUnavailableError(error)) {
          return false
        }

        return false
      } finally {
        if (activeAbortControllerRef.current === abortController) {
          activeAbortControllerRef.current = null

          if (isMountedRef.current) {
            setIsSending(false)
          }
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
    cancelAttachmentUpload,
    clearSendError,
    handleSendAttachmentBatch,
    isSending,
    sendErrorMessage,
    setSendErrorMessage: setSharedSendErrorMessage,
    transferState,
  }
}
