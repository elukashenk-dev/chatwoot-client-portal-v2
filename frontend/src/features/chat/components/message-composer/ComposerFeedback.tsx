import { useEffect, useRef, useState } from 'react'

import type { AttachmentTransferState } from '../../api/chatAttachmentTransport'
import { CHAT_TEXT_MESSAGE_MAX_LENGTH } from '../../lib/messageContentLimits'

export const TEXT_LENGTH_FEEDBACK_ID = 'chat-message-composer-length-feedback'
const TRANSFER_ANNOUNCEMENT_INTERVAL_MS = 750

function getTransferLabel(transferState: AttachmentTransferState) {
  switch (transferState.stage) {
    case 'error':
      return 'Ошибка'
    case 'preparing':
      return 'Подготовка'
    case 'sending':
      return 'Отправка'
    case 'uploading':
      return `Загрузка ${transferState.percent}%`
    default:
      return null
  }
}

function useThrottledTransferLabel(label: string | null) {
  const [announcedUploadLabel, setAnnouncedUploadLabel] = useState<
    string | null
  >(null)
  const latestUploadLabelRef = useRef<string | null>(null)
  const lastAnnouncementAtRef = useRef(0)
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (!label?.startsWith('Загрузка')) {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }

      latestUploadLabelRef.current = null
      lastAnnouncementAtRef.current = 0
      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = null
        setAnnouncedUploadLabel(null)
      }, 0)
      return
    }

    latestUploadLabelRef.current = label

    const now = Date.now()
    const elapsed = now - lastAnnouncementAtRef.current
    const announceLatestUpload = () => {
      timeoutRef.current = null
      lastAnnouncementAtRef.current = Date.now()
      setAnnouncedUploadLabel(latestUploadLabelRef.current)
    }

    if (
      lastAnnouncementAtRef.current === 0 ||
      elapsed >= TRANSFER_ANNOUNCEMENT_INTERVAL_MS
    ) {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
      }

      lastAnnouncementAtRef.current = now
      timeoutRef.current = window.setTimeout(announceLatestUpload, 0)
      return
    }

    if (timeoutRef.current === null) {
      timeoutRef.current = window.setTimeout(
        announceLatestUpload,
        TRANSFER_ANNOUNCEMENT_INTERVAL_MS - elapsed,
      )
    }
  }, [label])

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
      }
    },
    [],
  )

  return label?.startsWith('Загрузка') ? (announcedUploadLabel ?? label) : label
}

type ComposerFeedbackProps = {
  attachmentTransferState: AttachmentTransferState
  errorMessage: string | null
  normalizedDraftLength: number
  onCancelAttachmentUpload: () => void
  shouldShowTextLengthCounter: boolean
  textLengthErrorMessage: string | null
}

export function ComposerFeedback({
  attachmentTransferState,
  errorMessage,
  normalizedDraftLength,
  onCancelAttachmentUpload,
  shouldShowTextLengthCounter,
  textLengthErrorMessage,
}: ComposerFeedbackProps) {
  const transferLabel = getTransferLabel(attachmentTransferState)
  const announcedTransferLabel = useThrottledTransferLabel(transferLabel)

  return (
    <>
      {transferLabel ? (
        <div className="mt-2 flex min-h-8 items-center justify-between gap-3 rounded-[0.8rem] bg-slate-50/80 px-3 py-1.5 text-[12px] font-medium text-slate-600">
          <span aria-hidden="true">{transferLabel}</span>
          <span
            aria-atomic="true"
            aria-live="polite"
            className="sr-only"
            role="status"
          >
            Статус: {announcedTransferLabel}
          </span>
          {attachmentTransferState.stage === 'uploading' ? (
            <button
              className="rounded-md px-2 py-1 text-brand-800 transition hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
              onClick={onCancelAttachmentUpload}
              type="button"
            >
              Отменить загрузку
            </button>
          ) : null}
        </div>
      ) : null}
      {errorMessage ? (
        <div
          className="mt-2 rounded-[0.8rem] border border-rose-200/70 bg-rose-50/80 px-3 py-2 text-[12px] leading-5 text-rose-700 shadow-sm shadow-rose-900/[0.04] backdrop-blur-md"
          id={textLengthErrorMessage ? TEXT_LENGTH_FEEDBACK_ID : undefined}
        >
          {errorMessage}
        </div>
      ) : null}
      {shouldShowTextLengthCounter ? (
        <div
          className="mt-1 text-right text-[11px] leading-4 text-slate-500 tabular-nums"
          id={TEXT_LENGTH_FEEDBACK_ID}
        >
          {normalizedDraftLength}/{CHAT_TEXT_MESSAGE_MAX_LENGTH}
        </div>
      ) : null}
    </>
  )
}
