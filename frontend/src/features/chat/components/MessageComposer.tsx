import { useLayoutEffect, useRef, useState } from 'react'

import { cn } from '../../../shared/lib/cn'
import type { AttachmentTransferState } from '../api/chatAttachmentTransport'
import { ComposerAttachmentTray } from './message-composer/ComposerAttachmentTray'
import {
  ComposerFeedback,
  TEXT_LENGTH_FEEDBACK_ID,
} from './message-composer/ComposerFeedback'
import { ComposerInputRow } from './message-composer/ComposerInputRow'
import { ComposerReplyPreview } from './message-composer/ComposerReplyPreview'
import { VoiceRecordingPanel } from './message-composer/VoiceRecordingPanel'
import {
  getTextMessageLengthErrorMessage,
  shouldShowTextMessageLengthCounter,
} from '../lib/messageContentLimits'
import {
  normalizeAttachmentFile,
  type AttachmentDraftSource,
  type AttachmentDraftItem,
  validateAttachmentFile,
} from '../lib/attachmentDraft'
import type {
  MessageComposerReplyTarget,
  SendAttachmentBatchInput,
  SendMessageInput,
} from './message-composer/types'
import type { useAttachmentDraft } from './message-composer/useAttachmentDraft'
import { useComposerTextarea } from './message-composer/useComposerTextarea'
import { useAttachmentSendRetryKey } from './message-composer/useAttachmentSendRetryKey'
import { useSendButtonFocusGuard } from './message-composer/useSendButtonFocusGuard'
import { useVisualViewportKeyboardOpen } from './message-composer/useVisualViewportKeyboardOpen'
import { useVoiceRecorder } from './message-composer/useVoiceRecorder'
import { getComposerInteractionState } from './message-composer/interactionState'
import {
  createClientMessageKey,
  formatRecordingDuration,
} from './message-composer/utils'

export type { MessageComposerReplyTarget } from './message-composer/types'

type MessageComposerProps = {
  attachmentDraft: ReturnType<typeof useAttachmentDraft>
  attachmentDisabled?: boolean
  attachmentTransferState: AttachmentTransferState
  disabled: boolean
  errorMessage: string | null
  isSending: boolean
  onCancelAttachmentUpload: () => void
  onCancelReply: () => void
  onDraftTypingChange?: (draft: string) => void
  onSend: (input: SendMessageInput) => Promise<boolean>
  onSendAttachmentBatch: (input: SendAttachmentBatchInput) => Promise<boolean>
  replyTarget: MessageComposerReplyTarget | null
  voiceDisabled?: boolean
}

export function MessageComposer({
  attachmentDraft,
  attachmentDisabled = false,
  attachmentTransferState,
  disabled,
  errorMessage,
  isSending,
  onCancelAttachmentUpload,
  onCancelReply,
  onDraftTypingChange,
  onSend,
  onSendAttachmentBatch,
  replyTarget,
  voiceDisabled = false,
}: MessageComposerProps) {
  const [draft, setDraft] = useState('')
  const [isTextSendPending, setIsTextSendPending] = useState(false)
  const [pendingVoiceItem, setPendingVoiceItem] =
    useState<AttachmentDraftItem | null>(null)
  const [voiceValidationErrorMessage, setVoiceValidationErrorMessage] =
    useState<string | null>(null)
  const isVisualKeyboardOpen = useVisualViewportKeyboardOpen()
  const { focusTextarea, resizeTextarea, textareaRef } = useComposerTextarea()
  const attachmentSendRetryKey = useAttachmentSendRetryKey()
  const pendingClientMessageKeyRef = useRef<string | null>(null)
  const pendingContentRef = useRef<string | null>(null)
  const pendingReplyToMessageIdRef = useRef<number | null>(null)
  const replyToMessageIdRef = useRef<number | null>(null)
  const sendButtonRef = useRef<HTMLButtonElement | null>(null)
  const shouldRestoreFocusRef = useRef(false)
  const normalizedDraft = draft.trim()
  const normalizedDraftLength = normalizedDraft.length
  const textLengthErrorMessage = getTextMessageLengthErrorMessage(
    normalizedDraftLength,
  )
  const isTextDraftTooLong = textLengthErrorMessage !== null
  const shouldShowTextLengthCounter =
    !isTextDraftTooLong &&
    shouldShowTextMessageLengthCounter(normalizedDraftLength)
  const replyToMessageId = replyTarget?.id ?? null
  const shouldPrioritizeTextDraft = normalizedDraft.length > 0
  const isAttachmentSendDisabled = Boolean(attachmentDisabled)
  const isVoiceSendDisabled = Boolean(voiceDisabled)
  const currentAttachmentItems = pendingVoiceItem
    ? [pendingVoiceItem]
    : attachmentDraft.items
  const attachmentCount = currentAttachmentItems.length

  const {
    cancelVoiceRecording,
    clearErrorMessage: clearVoiceErrorMessage,
    errorMessage: voiceErrorMessage,
    finishVoiceRecording,
    recordingElapsedMs,
    startVoiceRecording,
    status: voiceRecorderStatus,
  } = useVoiceRecorder({
    canStartRecording:
      !isVoiceSendDisabled &&
      !disabled &&
      !isSending &&
      attachmentCount === 0 &&
      !shouldPrioritizeTextDraft,
    onSendVoiceAttachment: async (voiceFile) => {
      const rejection = validateAttachmentFile(voiceFile)

      if (rejection) {
        setVoiceValidationErrorMessage(rejection.message)
        return false
      }

      const normalizedVoiceFile = normalizeAttachmentFile(voiceFile)
      const voiceItem: AttachmentDraftItem = {
        file: normalizedVoiceFile,
        id: `voice:${normalizedVoiceFile.name}:${normalizedVoiceFile.lastModified}`,
        source: 'camera',
      }

      attachmentDraft.clearItems()
      setPendingVoiceItem(voiceItem)

      return submitAttachmentItems([voiceItem], {
        allowVoiceRecorderBusy: true,
        isVoiceAttachment: true,
      })
    },
  })

  const isVoiceRecorderBusy = voiceRecorderStatus !== 'idle'
  const {
    canSend,
    canSendAttachment,
    canSendText,
    canStartVoiceRecording,
    isAttachmentControlDisabled,
  } = getComposerInteractionState({
    attachmentCount,
    disabled,
    isAttachmentSendDisabled,
    isSending,
    isTextDraftTooLong,
    isTextSendPending,
    isVoiceRecorderBusy,
    isVoiceSendDisabled,
    normalizedDraftLength,
    shouldPrioritizeTextDraft,
  })
  const composerErrorMessage =
    voiceValidationErrorMessage ??
    attachmentDraft.errorMessage ??
    voiceErrorMessage ??
    textLengthErrorMessage ??
    errorMessage
  const recordingDuration = formatRecordingDuration(recordingElapsedMs)

  useLayoutEffect(() => {
    replyToMessageIdRef.current = replyToMessageId
  }, [replyToMessageId])

  useLayoutEffect(() => {
    resizeTextarea()
  }, [draft, resizeTextarea])

  useLayoutEffect(() => {
    if (!replyTarget || disabled || isSending) {
      return
    }

    focusTextarea()
  }, [disabled, focusTextarea, isSending, replyTarget])

  useLayoutEffect(() => {
    if (!shouldRestoreFocusRef.current || disabled || isSending) {
      return
    }

    shouldRestoreFocusRef.current = false
    focusTextarea()
  }, [attachmentCount, disabled, draft, focusTextarea, isSending, replyTarget])

  function resetPendingTextSendIfPayloadChanged(
    nextDraft: string,
    nextReplyToMessageId: number | null,
  ) {
    if (
      pendingClientMessageKeyRef.current &&
      (pendingContentRef.current !== nextDraft.trim() ||
        pendingReplyToMessageIdRef.current !== nextReplyToMessageId)
    ) {
      pendingClientMessageKeyRef.current = null
      pendingContentRef.current = null
      pendingReplyToMessageIdRef.current = null
    }
  }

  function handleCancelReply() {
    pendingClientMessageKeyRef.current = null
    pendingContentRef.current = null
    pendingReplyToMessageIdRef.current = null
    attachmentSendRetryKey.clear()
    onCancelReply()
  }

  async function submitText() {
    if (!canSendText) {
      return
    }

    clearVoiceErrorMessage()
    resetPendingTextSendIfPayloadChanged(normalizedDraft, replyToMessageId)

    const clientMessageKey =
      pendingClientMessageKeyRef.current ?? createClientMessageKey()

    pendingClientMessageKeyRef.current = clientMessageKey
    pendingContentRef.current = normalizedDraft
    pendingReplyToMessageIdRef.current = replyToMessageId
    setIsTextSendPending(true)

    try {
      const wasAccepted = await onSend({
        clientMessageKey,
        content: normalizedDraft,
        replyToMessageId,
      })

      if (!wasAccepted) {
        return
      }

      pendingClientMessageKeyRef.current = null
      pendingContentRef.current = null
      pendingReplyToMessageIdRef.current = null
      shouldRestoreFocusRef.current = true
      onCancelReply()
      updateDraft('')
    } finally {
      setIsTextSendPending(false)
    }
  }

  async function submitAttachmentItems(
    items: readonly AttachmentDraftItem[],
    {
      allowVoiceRecorderBusy = false,
      content = null,
      isVoiceAttachment = false,
    }: {
      allowVoiceRecorderBusy?: boolean
      content?: string | null
      isVoiceAttachment?: boolean
    } = {},
  ) {
    const isMediaSendDisabled = isVoiceAttachment
      ? isVoiceSendDisabled
      : isAttachmentSendDisabled

    if (
      isMediaSendDisabled ||
      disabled ||
      isSending ||
      items.length === 0 ||
      (!allowVoiceRecorderBusy && isVoiceRecorderBusy)
    ) {
      return false
    }

    const submittedItems = [...items]
    const normalizedAttachmentContent = content?.trim() || null
    const currentReplyToMessageId = replyToMessageIdRef.current
    const clientMessageKey = attachmentSendRetryKey.getOrCreateKey({
      content: normalizedAttachmentContent,
      items: submittedItems,
      replyToMessageId: currentReplyToMessageId,
    })

    clearVoiceErrorMessage()
    setVoiceValidationErrorMessage(null)

    const wasSent = await onSendAttachmentBatch({
      clientMessageKey,
      content: normalizedAttachmentContent,
      items: submittedItems,
      replyToMessageId: currentReplyToMessageId,
    })

    if (wasSent) {
      attachmentSendRetryKey.clear()
      shouldRestoreFocusRef.current = true
      onCancelReply()

      if (isVoiceAttachment) {
        setPendingVoiceItem(null)
      } else {
        attachmentDraft.clearItems()
      }

      updateDraft('')
    }

    return wasSent
  }

  async function submitAttachment() {
    if (!canSendAttachment) {
      return
    }

    await submitAttachmentItems(currentAttachmentItems, {
      content: normalizedDraft,
      isVoiceAttachment: pendingVoiceItem !== null,
    })
  }

  async function submitCurrentDraft() {
    if (attachmentCount > 0) {
      await submitAttachment()
      return
    }

    await submitText()
  }

  const { preserveTextareaFocusOnPointerDown, shouldSkipClickAfterTouchSend } =
    useSendButtonFocusGuard({
      onGuardedTouchSend: () => {
        void submitCurrentDraft()
      },
      sendButtonRef,
      textareaRef,
    })

  function addAttachmentFiles(
    files: readonly File[],
    source: AttachmentDraftSource = 'picker',
  ) {
    clearVoiceErrorMessage()
    setVoiceValidationErrorMessage(null)

    const admission = attachmentDraft.addFiles(files, source)

    if (admission.accepted.length > 0) {
      setPendingVoiceItem(null)
      attachmentSendRetryKey.clear()
    }

    return admission.accepted.length > 0
  }

  function removeAttachment(itemId: string) {
    attachmentSendRetryKey.clear()

    if (pendingVoiceItem?.id === itemId) {
      setPendingVoiceItem(null)
      attachmentDraft.clearItems()
    } else {
      attachmentDraft.removeItem(itemId)
    }
  }

  function clearAttachments() {
    attachmentSendRetryKey.clear()
    setPendingVoiceItem(null)
    attachmentDraft.clearItems()
  }

  function updateDraft(nextDraft: string) {
    clearVoiceErrorMessage()
    setVoiceValidationErrorMessage(null)
    resetPendingTextSendIfPayloadChanged(nextDraft, replyToMessageId)
    attachmentSendRetryKey.clearIfPayloadChanged({
      content: nextDraft.trim() || null,
      items: currentAttachmentItems,
      replyToMessageId,
    })
    setDraft(nextDraft)
    onDraftTypingChange?.(nextDraft)
  }

  return (
    <footer
      className={cn(
        'relative z-20 bg-transparent px-3 pt-2 sm:px-6',
        isVisualKeyboardOpen
          ? 'pb-1.5'
          : 'pb-[calc(0.75rem+env(safe-area-inset-bottom))]',
      )}
    >
      <div
        className="chat-floating-composer-surface mx-auto w-full max-w-[620px] rounded-[10px] border px-3 py-[9px]"
        data-chat-floating-surface="composer"
      >
        {replyTarget ? (
          <ComposerReplyPreview
            disabled={isSending || isVoiceRecorderBusy}
            onCancel={handleCancelReply}
            replyTarget={replyTarget}
          />
        ) : null}

        <ComposerAttachmentTray
          disabled={isSending || isVoiceRecorderBusy}
          items={
            pendingVoiceItem
              ? [{ ...pendingVoiceItem, previewUrl: null }]
              : attachmentDraft.viewItems
          }
          onClear={clearAttachments}
          onRemove={removeAttachment}
          totalBytes={
            pendingVoiceItem
              ? pendingVoiceItem.file.size
              : attachmentDraft.totalBytes
          }
        />

        <VoiceRecordingPanel
          durationLabel={recordingDuration}
          onCancel={cancelVoiceRecording}
          onSend={finishVoiceRecording}
          status={voiceRecorderStatus}
        />

        <ComposerInputRow
          ariaDescribedBy={
            textLengthErrorMessage || shouldShowTextLengthCounter
              ? TEXT_LENGTH_FEEDBACK_ID
              : undefined
          }
          canSend={canSend}
          canStartVoiceRecording={canStartVoiceRecording}
          disabled={disabled}
          draft={draft}
          isAttachmentControlDisabled={isAttachmentControlDisabled}
          isAttachmentSelected={attachmentCount > 0}
          isSending={isSending}
          isTextDraftTooLong={isTextDraftTooLong}
          isVoiceRecorderBusy={isVoiceRecorderBusy}
          isVoiceRecorderStarting={voiceRecorderStatus === 'starting'}
          onDraftChange={updateDraft}
          onFilesSelect={addAttachmentFiles}
          onPasteFiles={(files) => addAttachmentFiles(files, 'clipboard')}
          onSendButtonClick={() => {
            if (!shouldSkipClickAfterTouchSend()) {
              void submitCurrentDraft()
            }
          }}
          onSendButtonPointerDown={preserveTextareaFocusOnPointerDown}
          onStartVoiceRecording={() => {
            void startVoiceRecording()
          }}
          onSubmit={() => {
            void submitCurrentDraft()
          }}
          placeholder={disabled ? 'Чат временно недоступен' : 'Сообщение...'}
          sendButtonRef={sendButtonRef}
          shouldPrioritizeTextDraft={shouldPrioritizeTextDraft}
          textareaRef={textareaRef}
        />

        <ComposerFeedback
          attachmentTransferState={attachmentTransferState}
          errorMessage={composerErrorMessage}
          normalizedDraftLength={normalizedDraftLength}
          onCancelAttachmentUpload={onCancelAttachmentUpload}
          shouldShowTextLengthCounter={shouldShowTextLengthCounter}
          textLengthErrorMessage={textLengthErrorMessage}
        />
      </div>
    </footer>
  )
}
