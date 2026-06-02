import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'

import {
  retryFailedOfflineTextOutboxRecord,
  saveOfflineTextOutboxRecord,
} from '../../offline/offlineTextOutboxQueue'
import { isOfflineStorageQuotaError } from '../../offline/storagePersistence'
import type { OfflineTextOutboxRecord } from '../../offline/types'
import { buildSnapshotFromSendResult } from '../lib/chatSnapshot'
import {
  createOptimisticTextSend,
  type OptimisticTextSend,
} from '../lib/optimisticTextMessages'
import type { MessageComposerReplyTarget } from '../components/MessageComposer'
import type { ChatSendResult } from '../types'
import {
  ONLINE_CHAT_PAGE_CACHE_STATE,
  type ChatPageState,
} from './chatPageState'

const OUTBOX_WRITE_ERROR_MESSAGE =
  'Не удалось сохранить сообщение на этом устройстве. Попробуйте позже.'
const OUTBOX_QUOTA_ERROR_MESSAGE =
  'На устройстве мало места. Освободите место и попробуйте еще раз.'
const OFFLINE_QUEUE_STORAGE_UNAVAILABLE_MESSAGE =
  'На устройстве недостаточно места для офлайн-отправки сообщений.'

type TextSendInput = {
  clientMessageKey: string
  content: string
  replyToMessageId?: number | null
}

type UseOptimisticTextSendInput = {
  canUseOfflineTextQueue: boolean
  isBrowserOnline: boolean
  onOutboxRecordQueued?: () => void
  onTextSendStarted?: () => void
  pageState: ChatPageState
  replyTarget: MessageComposerReplyTarget | null
  setPageState: Dispatch<SetStateAction<ChatPageState>>
  setSendErrorMessage: Dispatch<SetStateAction<string | null>>
  tenantSlug: string | null
  threadId: string
  userId: number | null
}

type OutboxSendSucceededEvent = {
  record: OfflineTextOutboxRecord
  sendResult: ChatSendResult
}

type HydrateOptimisticTextSendsFromOutboxInput = {
  records: OfflineTextOutboxRecord[]
  requestedAt: Date
  threadId: string
}

function toOptimisticTextSendFromOutboxRecord(
  record: OfflineTextOutboxRecord,
  index: number,
): OptimisticTextSend {
  return {
    clientMessageKey: record.clientMessageKey,
    content: record.content,
    createdAt: record.createdAt,
    errorCode: record.errorCode,
    errorMessage: record.errorMessage,
    id: -1_000_000 - index,
    replyTo: record.replyTo,
    replyToMessageId: record.replyToMessageId,
    status: record.status,
    threadId: record.threadId,
  }
}

export function useOptimisticTextSend({
  canUseOfflineTextQueue,
  isBrowserOnline,
  onOutboxRecordQueued,
  onTextSendStarted,
  pageState,
  replyTarget,
  setPageState,
  setSendErrorMessage,
  tenantSlug,
  threadId,
  userId,
}: UseOptimisticTextSendInput) {
  const optimisticMessageIdRef = useRef(-1)
  const [optimisticTextSends, setOptimisticTextSends] = useState<
    OptimisticTextSend[]
  >([])

  const hydrateOptimisticTextSendsFromOutbox = useCallback(
    ({
      records,
      requestedAt,
      threadId: hydratedThreadId,
    }: HydrateOptimisticTextSendsFromOutboxInput) => {
      setOptimisticTextSends((currentSends) => {
        const hydratedSends = records.map(toOptimisticTextSendFromOutboxRecord)
        const hydratedKeys = new Set(
          hydratedSends.map(
            (send) => `${send.threadId}:${send.clientMessageKey}`,
          ),
        )
        const requestedAtMs = requestedAt.getTime()
        const preservedSends = currentSends.filter((send) => {
          if (send.threadId !== hydratedThreadId) {
            return true
          }

          if (hydratedKeys.has(`${send.threadId}:${send.clientMessageKey}`)) {
            return false
          }

          const createdAtMs = new Date(send.createdAt).getTime()

          return !Number.isFinite(createdAtMs) || createdAtMs >= requestedAtMs
        })

        return [...preservedSends, ...hydratedSends]
      })
    },
    [],
  )

  const handleOutboxSendSucceeded = useCallback(
    ({ record, sendResult }: OutboxSendSucceededEvent) => {
      setOptimisticTextSends((currentSends) =>
        currentSends.filter(
          (send) =>
            send.clientMessageKey !== record.clientMessageKey ||
            send.threadId !== record.threadId,
        ),
      )
      setPageState((currentState) => {
        if (currentState.selectedThreadId !== record.threadId) {
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
    },
    [setPageState],
  )

  const handleSendMessage = useCallback(
    async ({ clientMessageKey, content, replyToMessageId }: TextSendInput) => {
      if (
        tenantSlug === null ||
        userId === null ||
        pageState.status !== 'ready'
      ) {
        return false
      }

      if (!isBrowserOnline && !canUseOfflineTextQueue) {
        setSendErrorMessage(OFFLINE_QUEUE_STORAGE_UNAVAILABLE_MESSAGE)
        return false
      }

      const now = new Date()
      const optimisticSend = createOptimisticTextSend({
        clientMessageKey,
        content,
        id: optimisticMessageIdRef.current,
        now,
        replyTarget,
        replyToMessageId: replyToMessageId ?? null,
        status: isBrowserOnline ? 'sending' : 'queued',
        threadId,
      })

      try {
        await saveOfflineTextOutboxRecord({
          attemptCount: 0,
          clientMessageKey,
          content,
          createdAt: now.toISOString(),
          errorCode: null,
          errorMessage: null,
          lastAttemptAt: null,
          nextAttemptAt: null,
          replyTo: optimisticSend.replyTo,
          replyToMessageId: replyToMessageId ?? null,
          sendOwnerId: null,
          sendingLeaseExpiresAt: null,
          sendingStartedAt: null,
          status: 'queued',
          tenantSlug,
          threadId,
          updatedAt: now.toISOString(),
          userId,
        })
      } catch (error) {
        setSendErrorMessage(
          isOfflineStorageQuotaError(error)
            ? OUTBOX_QUOTA_ERROR_MESSAGE
            : OUTBOX_WRITE_ERROR_MESSAGE,
        )
        return false
      }

      optimisticMessageIdRef.current -= 1
      setOptimisticTextSends((currentSends) => [
        ...currentSends.filter(
          (send) =>
            send.clientMessageKey !== clientMessageKey ||
            send.threadId !== threadId,
        ),
        optimisticSend,
      ])
      onTextSendStarted?.()
      onOutboxRecordQueued?.()

      return true
    },
    [
      canUseOfflineTextQueue,
      isBrowserOnline,
      onOutboxRecordQueued,
      onTextSendStarted,
      pageState,
      replyTarget,
      setSendErrorMessage,
      tenantSlug,
      threadId,
      userId,
    ],
  )

  const handleRetryTextMessage = useCallback(
    async (clientMessageKey: string) => {
      if (!isBrowserOnline || tenantSlug === null || userId === null) {
        return
      }

      const optimisticSend = optimisticTextSends.find(
        (send) =>
          send.clientMessageKey === clientMessageKey &&
          send.threadId === threadId,
      )

      if (!optimisticSend || optimisticSend.status !== 'failed') {
        return
      }

      try {
        const retryRecord = await retryFailedOfflineTextOutboxRecord({
          clientMessageKey,
          tenantSlug,
          threadId,
          userId,
        })

        if (!retryRecord) {
          return
        }

        setOptimisticTextSends((currentSends) =>
          currentSends.map((send) =>
            send.clientMessageKey === clientMessageKey &&
            send.threadId === threadId
              ? {
                  ...send,
                  errorCode: null,
                  errorMessage: null,
                  status: 'sending',
                }
              : send,
          ),
        )
        onOutboxRecordQueued?.()
      } catch (error) {
        setSendErrorMessage(
          isOfflineStorageQuotaError(error)
            ? OUTBOX_QUOTA_ERROR_MESSAGE
            : OUTBOX_WRITE_ERROR_MESSAGE,
        )
      }
    },
    [
      isBrowserOnline,
      onOutboxRecordQueued,
      optimisticTextSends,
      setSendErrorMessage,
      tenantSlug,
      threadId,
      userId,
    ],
  )

  return {
    handleOutboxSendSucceeded,
    handleRetryTextMessage,
    handleSendMessage,
    hydrateOptimisticTextSendsFromOutbox,
    optimisticTextSends,
  }
}
