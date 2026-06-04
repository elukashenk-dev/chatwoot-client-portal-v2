import { useLayoutEffect, useRef, useState } from 'react'

import { cn } from '../../../shared/lib/cn'
import { MicrophoneIcon, PaperclipIcon } from '../../../shared/ui/icons'
import { ComposerAttachmentPreview } from './message-composer/ComposerAttachmentPreview'
import {
  ComposerFeedback,
  TEXT_LENGTH_FEEDBACK_ID,
} from './message-composer/ComposerFeedback'
import { ComposerReplyPreview } from './message-composer/ComposerReplyPreview'
import { ComposerSendButton } from './message-composer/ComposerSendButton'
import { ComposerSideControl } from './message-composer/ComposerSideControl'
import { ComposerTextarea } from './message-composer/ComposerTextarea'
import { VoiceRecordingPanel } from './message-composer/VoiceRecordingPanel'
import {
  getTextMessageLengthErrorMessage,
  shouldShowTextMessageLengthCounter,
} from '../lib/messageContentLimits'
import type {
  MessageComposerReplyTarget,
  SendAttachmentInput,
  SendMessageInput,
} from './message-composer/types'
import { useComposerTextarea } from './message-composer/useComposerTextarea'
import { useSendButtonFocusGuard } from './message-composer/useSendButtonFocusGuard'
import { useVisualViewportKeyboardOpen } from './message-composer/useVisualViewportKeyboardOpen'
import { useVoiceRecorder } from './message-composer/useVoiceRecorder'
import { getComposerInteractionState } from './message-composer/interactionState'
import {
  createAttachmentSignature,
  createClientMessageKey,
  formatRecordingDuration,
} from './message-composer/utils'

export type { MessageComposerReplyTarget } from './message-composer/types'

type MessageComposerProps = {
  attachmentDisabled?: boolean
  disabled: boolean
  errorMessage: string | null
  isSending: boolean
  onCancelReply: () => void
  onDraftTypingChange?: (draft: string) => void
  onSend: (input: SendMessageInput) => Promise<boolean>
  onSendAttachment: (input: SendAttachmentInput) => Promise<boolean>
  replyTarget: MessageComposerReplyTarget | null
  voiceDisabled?: boolean
}

export function MessageComposer({
  attachmentDisabled = false,
  disabled,
  errorMessage,
  isSending,
  onCancelReply,
  onDraftTypingChange,
  onSend,
  onSendAttachment,
  replyTarget,
  voiceDisabled = false,
}: MessageComposerProps) {
  const [draft, setDraft] = useState('')
  const [isTextSendPending, setIsTextSendPending] = useState(false)
  const [selectedAttachment, setSelectedAttachment] = useState<File | null>(
    null,
  )
  const isVisualKeyboardOpen = useVisualViewportKeyboardOpen()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { focusTextarea, resizeTextarea, textareaRef } = useComposerTextarea()
  const pendingAttachmentClientMessageKeyRef = useRef<string | null>(null)
  const pendingAttachmentContentRef = useRef<string | null>(null)
  const pendingAttachmentReplyToMessageIdRef = useRef<number | null>(null)
  const pendingAttachmentSignatureRef = useRef<string | null>(null)
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
      selectedAttachment === null &&
      !shouldPrioritizeTextDraft,
    onSendVoiceAttachment: async (voiceFile) => {
      setSelectedAttachment(voiceFile)

      return submitAttachmentFile(voiceFile, { allowVoiceRecorderBusy: true })
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
    disabled,
    isAttachmentSendDisabled,
    isSending,
    isTextDraftTooLong,
    isTextSendPending,
    isVoiceRecorderBusy,
    isVoiceSendDisabled,
    normalizedDraftLength,
    selectedAttachment,
    shouldPrioritizeTextDraft,
  })
  const composerErrorMessage =
    voiceErrorMessage ?? textLengthErrorMessage ?? errorMessage
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
  }, [
    disabled,
    draft,
    focusTextarea,
    isSending,
    replyTarget,
    selectedAttachment,
  ])

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
    pendingAttachmentClientMessageKeyRef.current = null
    pendingAttachmentContentRef.current = null
    pendingAttachmentReplyToMessageIdRef.current = null
    pendingAttachmentSignatureRef.current = null
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

  async function submitAttachmentFile(
    file: File,
    {
      allowVoiceRecorderBusy = false,
      content = null,
    }: { allowVoiceRecorderBusy?: boolean; content?: string | null } = {},
  ) {
    const isVoiceAttachment = allowVoiceRecorderBusy
    const isMediaSendDisabled = isVoiceAttachment
      ? isVoiceSendDisabled
      : isAttachmentSendDisabled

    if (
      isMediaSendDisabled ||
      disabled ||
      isSending ||
      (!allowVoiceRecorderBusy && isVoiceRecorderBusy)
    ) {
      return false
    }

    const attachmentSignature = createAttachmentSignature(file)
    const normalizedAttachmentContent = content?.trim() || null
    const currentReplyToMessageId = replyToMessageIdRef.current

    if (
      pendingAttachmentClientMessageKeyRef.current &&
      (pendingAttachmentReplyToMessageIdRef.current !==
        currentReplyToMessageId ||
        pendingAttachmentContentRef.current !== normalizedAttachmentContent ||
        pendingAttachmentSignatureRef.current !== attachmentSignature)
    ) {
      pendingAttachmentClientMessageKeyRef.current = null
      pendingAttachmentContentRef.current = null
      pendingAttachmentReplyToMessageIdRef.current = null
      pendingAttachmentSignatureRef.current = null
    }

    const clientMessageKey =
      pendingAttachmentClientMessageKeyRef.current ?? createClientMessageKey()

    clearVoiceErrorMessage()
    pendingAttachmentClientMessageKeyRef.current = clientMessageKey
    pendingAttachmentContentRef.current = normalizedAttachmentContent
    pendingAttachmentReplyToMessageIdRef.current = currentReplyToMessageId
    pendingAttachmentSignatureRef.current = attachmentSignature

    const wasSent = await onSendAttachment({
      clientMessageKey,
      content: normalizedAttachmentContent,
      file,
      replyToMessageId: currentReplyToMessageId,
    })

    if (wasSent) {
      pendingAttachmentClientMessageKeyRef.current = null
      pendingAttachmentContentRef.current = null
      pendingAttachmentReplyToMessageIdRef.current = null
      pendingAttachmentSignatureRef.current = null
      shouldRestoreFocusRef.current = true
      onCancelReply()
      setSelectedAttachment(null)
      updateDraft('')

      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }

    return wasSent
  }

  async function submitAttachment() {
    if (!canSendAttachment || !selectedAttachment) {
      return
    }

    await submitAttachmentFile(selectedAttachment, {
      content: normalizedDraft,
    })
  }

  async function submitCurrentDraft() {
    if (selectedAttachment) {
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

  function selectAttachment(file: File | null) {
    if (!file) {
      setSelectedAttachment(null)
      pendingAttachmentClientMessageKeyRef.current = null
      pendingAttachmentContentRef.current = null
      pendingAttachmentReplyToMessageIdRef.current = null
      pendingAttachmentSignatureRef.current = null
      return
    }

    clearVoiceErrorMessage()
    const nextSignature = createAttachmentSignature(file)

    if (pendingAttachmentSignatureRef.current !== nextSignature) {
      pendingAttachmentClientMessageKeyRef.current = null
      pendingAttachmentContentRef.current = null
      pendingAttachmentReplyToMessageIdRef.current = null
      pendingAttachmentSignatureRef.current = null
    }

    setSelectedAttachment(file)
  }

  function updateDraft(nextDraft: string) {
    clearVoiceErrorMessage()
    resetPendingTextSendIfPayloadChanged(nextDraft, replyToMessageId)
    setDraft(nextDraft)
    onDraftTypingChange?.(nextDraft)
  }

  return (
    <footer
      className={cn(
        'border-t border-slate-200/70 bg-white px-4 pt-3 sm:px-6',
        isVisualKeyboardOpen
          ? 'pb-1.5'
          : 'pb-[calc(0.75rem+env(safe-area-inset-bottom))]',
      )}
    >
      <div className="mx-auto w-full max-w-[620px]">
        {replyTarget ? (
          <ComposerReplyPreview
            disabled={isSending || isVoiceRecorderBusy}
            onCancel={handleCancelReply}
            replyTarget={replyTarget}
          />
        ) : null}

        {selectedAttachment ? (
          <ComposerAttachmentPreview
            disabled={isSending || isVoiceRecorderBusy}
            file={selectedAttachment}
            onRemove={() => {
              selectAttachment(null)

              if (fileInputRef.current) {
                fileInputRef.current.value = ''
              }
            }}
          />
        ) : null}

        <VoiceRecordingPanel
          durationLabel={recordingDuration}
          onCancel={cancelVoiceRecording}
          onSend={finishVoiceRecording}
          status={voiceRecorderStatus}
        />

        <div className="flex items-end gap-2">
          <input
            accept="image/*,video/*,audio/*,.csv,.doc,.docx,.json,.pdf,.ppt,.pptx,.rtf,.txt,.xls,.xlsx,.zip,.7z"
            aria-label="Файл вложения"
            className="sr-only"
            disabled={isAttachmentControlDisabled}
            onChange={(event) => {
              selectAttachment(event.target.files?.[0] ?? null)
            }}
            ref={fileInputRef}
            type="file"
          />
          <ComposerSideControl
            control="attachment"
            isCollapsed={shouldPrioritizeTextDraft}
          >
            <button
              aria-label="Прикрепить файл"
              className="inline-flex h-10 w-10 items-center justify-center rounded-chat-control text-chat-outgoing transition hover:bg-slate-100 hover:text-chat-outgoing/80 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:text-slate-300"
              disabled={isAttachmentControlDisabled}
              onClick={() => {
                fileInputRef.current?.click()
              }}
              tabIndex={shouldPrioritizeTextDraft ? -1 : undefined}
              title="Прикрепить файл"
              type="button"
            >
              <PaperclipIcon className="h-5 w-5" />
            </button>
          </ComposerSideControl>

          <ComposerTextarea
            ariaDescribedBy={
              textLengthErrorMessage || shouldShowTextLengthCounter
                ? TEXT_LENGTH_FEEDBACK_ID
                : undefined
            }
            disabled={disabled || isSending || isVoiceRecorderBusy}
            draft={draft}
            isInvalid={isTextDraftTooLong}
            onDraftChange={updateDraft}
            onSubmit={() => {
              void submitCurrentDraft()
            }}
            placeholder={disabled ? 'Чат временно недоступен' : 'Сообщение...'}
            textareaRef={textareaRef}
          />

          <ComposerSideControl
            control="voice"
            isCollapsed={shouldPrioritizeTextDraft}
          >
            <button
              aria-label="Голосовое сообщение"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-chat-outgoing transition hover:bg-slate-100 hover:text-chat-outgoing/80 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:text-slate-300"
              disabled={!canStartVoiceRecording}
              onClick={() => {
                void startVoiceRecording()
              }}
              tabIndex={shouldPrioritizeTextDraft ? -1 : undefined}
              title="Записать голосовое"
              type="button"
            >
              <MicrophoneIcon
                className={
                  voiceRecorderStatus === 'starting'
                    ? 'h-5 w-5 animate-pulse'
                    : 'h-5 w-5'
                }
              />
            </button>
          </ComposerSideControl>
          <ComposerSendButton
            canSend={canSend && !isVoiceRecorderBusy}
            isAttachmentSelected={selectedAttachment !== null}
            isSending={isSending}
            onClick={() => {
              if (!shouldSkipClickAfterTouchSend()) {
                void submitCurrentDraft()
              }
            }}
            onPointerDown={preserveTextareaFocusOnPointerDown}
            sendButtonRef={sendButtonRef}
          />
        </div>

        <ComposerFeedback
          errorMessage={composerErrorMessage}
          normalizedDraftLength={normalizedDraftLength}
          shouldShowTextLengthCounter={shouldShowTextLengthCounter}
          textLengthErrorMessage={textLengthErrorMessage}
        />
      </div>
    </footer>
  )
}
