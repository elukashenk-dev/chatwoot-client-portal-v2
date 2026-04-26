import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { cn } from '../../../shared/lib/cn'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import { ComposerAttachmentPreview } from './message-composer/ComposerAttachmentPreview'
import { ComposerInputRow } from './message-composer/ComposerInputRow'
import { ComposerReplyPreview } from './message-composer/ComposerReplyPreview'
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
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false)
  const [selectedAttachment, setSelectedAttachment] = useState<File | null>(
    null,
  )
  const isVisualKeyboardOpen = useVisualViewportKeyboardOpen()
  const composerFrameRef = useRef<HTMLDivElement | null>(null)
  const emojiButtonRef = useRef<HTMLButtonElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const pendingAttachmentClientMessageKeyRef = useRef<string | null>(null)
  const pendingAttachmentContentRef = useRef<string | null>(null)
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
  const shouldPrioritizeTextDraft = normalizedDraft.length > 0
  const shouldPrioritizeAttachment = selectedAttachment !== null
  const shouldHideIdleControls =
    shouldPrioritizeTextDraft || shouldPrioritizeAttachment

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
  const isVoiceRecordingActive =
    voiceRecorderStatus === 'starting' || voiceRecorderStatus === 'recording'
  const canSendText =
    normalizedDraft.length > 0 &&
    !disabled &&
    !isSending &&
    !isVoiceRecorderBusy
  const canSendAttachment =
    selectedAttachment !== null &&
    !disabled &&
    !isSending &&
    !isVoiceRecorderBusy
  const canSend = canSendAttachment || canSendText
  const canStartVoiceRecording =
    !disabled &&
    !isSending &&
    !isVoiceRecorderBusy &&
    selectedAttachment === null &&
    !shouldPrioritizeTextDraft
  const isAttachmentControlDisabled =
    disabled || isSending || isVoiceRecorderBusy || shouldHideIdleControls
  const isEmojiControlDisabled = disabled || isSending || isVoiceRecorderBusy
  const isEmojiPickerVisible = isEmojiPickerOpen && !isEmojiControlDisabled
  const shouldShowSendControl =
    shouldPrioritizeTextDraft || shouldPrioritizeAttachment || isSending
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

  useEffect(() => {
    if (!isEmojiPickerVisible) {
      return undefined
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target

      if (
        target instanceof Node &&
        composerFrameRef.current?.contains(target)
      ) {
        return
      }

      setIsEmojiPickerOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsEmojiPickerOpen(false)
        emojiButtonRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isEmojiPickerVisible])

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
    pendingAttachmentContentRef.current = null
    pendingAttachmentReplyToMessageIdRef.current = null
    pendingAttachmentSignatureRef.current = null
    onCancelReply()
  }

  function closeEmojiPicker() {
    if (isEmojiPickerOpen) {
      setIsEmojiPickerOpen(false)
    }
  }

  function submitText() {
    if (!canSendText) {
      return
    }

    clearVoiceErrorMessage()
    closeEmojiPicker()
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
      content = null,
    }: { allowVoiceRecorderBusy?: boolean; content?: string | null } = {},
  ) {
    if (
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
    closeEmojiPicker()
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
      setDraft('')

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

    submitText()
  }

  function selectAttachment(file: File | null) {
    closeEmojiPicker()

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

  function insertQuickText(
    text: string,
    { closePicker = false }: { closePicker?: boolean } = {},
  ) {
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

    if (closePicker) {
      setIsEmojiPickerOpen(false)
    }
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

        <div
          className="relative rounded-[1rem] border border-slate-200 bg-slate-50/90 p-2"
          ref={composerFrameRef}
        >
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

          <ComposerInputRow
            canSend={canSend}
            canStartVoiceRecording={canStartVoiceRecording}
            disabled={disabled}
            draft={draft}
            emojiButtonRef={emojiButtonRef}
            fileInputRef={fileInputRef}
            isAttachmentControlDisabled={isAttachmentControlDisabled}
            isEmojiControlDisabled={isEmojiControlDisabled}
            isEmojiPickerOpen={isEmojiPickerVisible}
            isSending={isSending}
            isVoiceRecordingActive={isVoiceRecordingActive}
            onChangeDraft={(nextDraft) => {
              clearVoiceErrorMessage()
              resetPendingTextSendIfPayloadChanged(nextDraft, replyToMessageId)
              setDraft(nextDraft)
            }}
            onInsertEmoji={(emoji) => {
              insertQuickText(emoji)
            }}
            onInsertPhrase={(text) => {
              insertQuickText(text, { closePicker: true })
            }}
            onSelectAttachment={selectAttachment}
            onStartVoiceRecording={() => {
              closeEmojiPicker()
              void startVoiceRecording()
            }}
            onSubmitCurrentDraft={() => {
              void submitCurrentDraft()
            }}
            onToggleEmojiPicker={() => {
              setIsEmojiPickerOpen((isOpen) =>
                isEmojiControlDisabled ? false : !isOpen,
              )
            }}
            selectedAttachment={selectedAttachment}
            shouldHideIdleControls={shouldHideIdleControls}
            shouldShowSendControl={shouldShowSendControl}
            textareaRef={textareaRef}
            voiceRecorderStatus={voiceRecorderStatus}
          />
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
