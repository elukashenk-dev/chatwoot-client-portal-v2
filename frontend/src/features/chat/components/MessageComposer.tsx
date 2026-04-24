import { useLayoutEffect, useRef, useState } from 'react'

import { cn } from '../../../shared/lib/cn'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import {
  MicrophoneIcon,
  PaperclipIcon,
  SendIcon,
} from '../../../shared/ui/icons'
import { ComposerAttachmentPreview } from './message-composer/ComposerAttachmentPreview'
import { ComposerReplyPreview } from './message-composer/ComposerReplyPreview'
import { QuickEmojiBar } from './message-composer/QuickEmojiBar'
import { VoiceRecordingPanel } from './message-composer/VoiceRecordingPanel'
import type {
  MessageComposerReplyTarget,
  SendAttachmentInput,
  SendMessageInput,
} from './message-composer/types'
import { useVisualViewportKeyboardOpen } from './message-composer/useVisualViewportKeyboardOpen'
import { useVoiceRecorder } from './message-composer/useVoiceRecorder'
import {
  createAttachmentSignature,
  createClientMessageKey,
  formatRecordingDuration,
  resizeComposerTextarea,
} from './message-composer/utils'

export type { MessageComposerReplyTarget } from './message-composer/types'

type MessageComposerProps = {
  disabled: boolean
  errorMessage: string | null
  isSending: boolean
  offlineAlertMessage?: string | null
  onCancelReply: () => void
  onSend: (input: SendMessageInput) => Promise<boolean>
  onSendAttachment: (input: SendAttachmentInput) => Promise<boolean>
  replyTarget: MessageComposerReplyTarget | null
}

export function MessageComposer({
  disabled,
  errorMessage,
  isSending,
  offlineAlertMessage = null,
  onCancelReply,
  onSend,
  onSendAttachment,
  replyTarget,
}: MessageComposerProps) {
  const [draft, setDraft] = useState('')
  const [selectedAttachment, setSelectedAttachment] = useState<File | null>(
    null,
  )
  const isVisualKeyboardOpen = useVisualViewportKeyboardOpen()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const pendingAttachmentClientMessageKeyRef = useRef<string | null>(null)
  const pendingAttachmentReplyToMessageIdRef = useRef<number | null>(null)
  const pendingAttachmentSignatureRef = useRef<string | null>(null)
  const pendingCaretPositionRef = useRef<number | null>(null)
  const pendingClientMessageKeyRef = useRef<string | null>(null)
  const pendingContentRef = useRef<string | null>(null)
  const pendingReplyToMessageIdRef = useRef<number | null>(null)
  const replyToMessageIdRef = useRef<number | null>(null)
  const shouldRestoreFocusRef = useRef(false)
  const normalizedDraft = draft.trim()
  const replyToMessageId = replyTarget?.id ?? null

  const {
    cancelVoiceRecording,
    clearErrorMessage: clearVoiceErrorMessage,
    errorMessage: voiceErrorMessage,
    finishVoiceRecording,
    recordingElapsedMs,
    startVoiceRecording,
    status: voiceRecorderStatus,
  } = useVoiceRecorder({
    canStartRecording: !disabled && !isSending && selectedAttachment === null,
    onSendVoiceAttachment: async (voiceFile) => {
      setSelectedAttachment(voiceFile)

      return submitAttachmentFile(voiceFile, {
        allowVoiceRecorderBusy: true,
      })
    },
  })

  const isVoiceRecorderBusy = voiceRecorderStatus !== 'idle'
  const canSendText =
    !disabled &&
    !isSending &&
    !isVoiceRecorderBusy &&
    normalizedDraft.length > 0
  const canSendAttachment =
    !disabled &&
    !isSending &&
    !isVoiceRecorderBusy &&
    selectedAttachment !== null
  const canSend = canSendAttachment || canSendText
  const canStartVoiceRecording =
    !disabled &&
    !isSending &&
    !isVoiceRecorderBusy &&
    selectedAttachment === null
  const composerErrorMessage = voiceErrorMessage ?? errorMessage
  const recordingDuration = formatRecordingDuration(recordingElapsedMs)

  useLayoutEffect(() => {
    replyToMessageIdRef.current = replyToMessageId
  }, [replyToMessageId])

  useLayoutEffect(() => {
    if (!textareaRef.current) {
      return
    }

    const textarea = textareaRef.current

    resizeComposerTextarea(textarea)

    if (pendingCaretPositionRef.current !== null && !disabled && !isSending) {
      const nextCaretPosition = pendingCaretPositionRef.current

      pendingCaretPositionRef.current = null
      textarea.focus()
      textarea.setSelectionRange(nextCaretPosition, nextCaretPosition)
    }
  }, [disabled, draft, isSending])

  useLayoutEffect(() => {
    if (!replyTarget || disabled || isSending) {
      return
    }

    textareaRef.current?.focus()
  }, [disabled, isSending, replyTarget])

  useLayoutEffect(() => {
    if (!shouldRestoreFocusRef.current || disabled || isSending) {
      return
    }

    shouldRestoreFocusRef.current = false
    textareaRef.current?.focus()
  }, [disabled, draft, isSending, replyTarget, selectedAttachment])

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
    pendingAttachmentReplyToMessageIdRef.current = null
    pendingAttachmentSignatureRef.current = null
    onCancelReply()
  }

  function submitText() {
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

    pendingClientMessageKeyRef.current = null
    pendingContentRef.current = null
    pendingReplyToMessageIdRef.current = null
    shouldRestoreFocusRef.current = true
    onCancelReply()
    setDraft('')

    void onSend({
      clientMessageKey,
      content: normalizedDraft,
      replyToMessageId,
    })
  }

  async function submitAttachmentFile(
    file: File,
    {
      allowVoiceRecorderBusy = false,
    }: { allowVoiceRecorderBusy?: boolean } = {},
  ) {
    if (
      disabled ||
      isSending ||
      (!allowVoiceRecorderBusy && isVoiceRecorderBusy)
    ) {
      return false
    }

    const attachmentSignature = createAttachmentSignature(file)
    const currentReplyToMessageId = replyToMessageIdRef.current

    if (
      pendingAttachmentClientMessageKeyRef.current &&
      (pendingAttachmentReplyToMessageIdRef.current !==
        currentReplyToMessageId ||
        pendingAttachmentSignatureRef.current !== attachmentSignature)
    ) {
      pendingAttachmentClientMessageKeyRef.current = null
      pendingAttachmentReplyToMessageIdRef.current = null
      pendingAttachmentSignatureRef.current = null
    }

    const clientMessageKey =
      pendingAttachmentClientMessageKeyRef.current ?? createClientMessageKey()

    clearVoiceErrorMessage()
    pendingAttachmentClientMessageKeyRef.current = clientMessageKey
    pendingAttachmentReplyToMessageIdRef.current = currentReplyToMessageId
    pendingAttachmentSignatureRef.current = attachmentSignature

    const wasSent = await onSendAttachment({
      clientMessageKey,
      file,
      replyToMessageId: currentReplyToMessageId,
    })

    if (wasSent) {
      pendingAttachmentClientMessageKeyRef.current = null
      pendingAttachmentReplyToMessageIdRef.current = null
      pendingAttachmentSignatureRef.current = null
      shouldRestoreFocusRef.current = true
      onCancelReply()
      setSelectedAttachment(null)

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

    await submitAttachmentFile(selectedAttachment)
  }

  async function submitCurrentDraft() {
    if (selectedAttachment) {
      await submitAttachment()
      return
    }

    submitText()
  }

  function selectAttachment(file: File | null) {
    if (!file) {
      setSelectedAttachment(null)
      pendingAttachmentClientMessageKeyRef.current = null
      pendingAttachmentReplyToMessageIdRef.current = null
      pendingAttachmentSignatureRef.current = null
      return
    }

    clearVoiceErrorMessage()
    const nextSignature = createAttachmentSignature(file)

    if (pendingAttachmentSignatureRef.current !== nextSignature) {
      pendingAttachmentClientMessageKeyRef.current = null
      pendingAttachmentReplyToMessageIdRef.current = null
      pendingAttachmentSignatureRef.current = null
    }

    setSelectedAttachment(file)
  }

  function insertQuickText(text: string) {
    if (disabled || isSending || isVoiceRecorderBusy) {
      return
    }

    clearVoiceErrorMessage()
    const textarea = textareaRef.current
    const selectionStart = textarea?.selectionStart ?? draft.length
    const selectionEnd = textarea?.selectionEnd ?? draft.length
    const nextDraft = `${draft.slice(0, selectionStart)}${text}${draft.slice(
      selectionEnd,
    )}`

    pendingCaretPositionRef.current = selectionStart + text.length
    resetPendingTextSendIfPayloadChanged(nextDraft, replyToMessageId)
    setDraft(nextDraft)
  }

  return (
    <footer
      className={cn(
        'border-t border-slate-200/90 bg-white/95 px-4 pt-4 backdrop-blur-sm sm:px-6',
        isVisualKeyboardOpen ? 'pb-2' : 'app-safe-bottom',
      )}
    >
      <div className="mx-auto w-full max-w-[620px]">
        {offlineAlertMessage ? (
          <div className="mb-3">
            <InlineAlert message={offlineAlertMessage} tone="error" />
          </div>
        ) : null}

        <QuickEmojiBar
          disabled={disabled || isSending || isVoiceRecorderBusy}
          onInsert={insertQuickText}
        />

        <div className="rounded-[1rem] border border-slate-200 bg-slate-50/90 p-2">
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
              disabled={disabled || isSending || isVoiceRecorderBusy}
              onChange={(event) => {
                selectAttachment(event.target.files?.[0] ?? null)
              }}
              ref={fileInputRef}
              type="file"
            />
            <button
              aria-label="Прикрепить файл"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.75rem] text-slate-500 transition hover:bg-white hover:text-brand-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:text-slate-300"
              disabled={disabled || isSending || isVoiceRecorderBusy}
              onClick={() => {
                fileInputRef.current?.click()
              }}
              title="Прикрепить файл"
              type="button"
            >
              <PaperclipIcon className="h-[18px] w-[18px]" />
            </button>

            <textarea
              aria-label="Сообщение"
              className="max-h-32 min-h-[44px] min-w-0 flex-1 resize-none overflow-hidden border-0 bg-transparent px-2 py-2 text-[15px] leading-6 text-slate-800 shadow-none outline-none placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-0 focus-visible:outline-none disabled:text-slate-400"
              disabled={disabled || isSending || isVoiceRecorderBusy}
              onChange={(event) => {
                const nextDraft = event.target.value

                clearVoiceErrorMessage()
                resetPendingTextSendIfPayloadChanged(
                  nextDraft,
                  replyToMessageId,
                )
                setDraft(nextDraft)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void submitCurrentDraft()
                }
              }}
              placeholder={
                disabled ? 'Чат временно недоступен' : 'Сообщение...'
              }
              ref={textareaRef}
              rows={1}
              value={draft}
            />

            <button
              aria-label="Голосовое сообщение"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.75rem] text-slate-500 transition hover:bg-white hover:text-brand-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:text-slate-300"
              disabled={!canStartVoiceRecording}
              onClick={() => {
                void startVoiceRecording()
              }}
              title="Записать голосовое"
              type="button"
            >
              <MicrophoneIcon
                className={
                  voiceRecorderStatus === 'starting'
                    ? 'h-[18px] w-[18px] animate-pulse'
                    : 'h-[18px] w-[18px]'
                }
              />
            </button>
            <button
              aria-label={
                isSending
                  ? 'Отправляем'
                  : selectedAttachment
                    ? 'Отправить файл'
                    : 'Отправить'
              }
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.75rem] bg-brand-800 text-white transition hover:bg-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-200"
              disabled={!canSend || isVoiceRecorderBusy}
              onClick={() => {
                void submitCurrentDraft()
              }}
              title="Отправить"
              type="button"
            >
              <SendIcon
                className={
                  isSending
                    ? 'h-[18px] w-[18px] animate-pulse'
                    : 'h-[18px] w-[18px]'
                }
              />
            </button>
          </div>
        </div>

        {composerErrorMessage ? (
          <div className="mt-2 rounded-[0.8rem] border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] leading-5 text-rose-700">
            {composerErrorMessage}
          </div>
        ) : null}
      </div>
    </footer>
  )
}
