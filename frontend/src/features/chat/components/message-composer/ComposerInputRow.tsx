import type { PointerEvent, RefObject } from 'react'

import { MicrophoneIcon, PaperclipIcon } from '../../../../shared/ui/icons'
import { ComposerSendButton } from './ComposerSendButton'
import { ComposerSideButton } from './ComposerSideButton'
import { ComposerSideControl } from './ComposerSideControl'
import { ComposerTextarea } from './ComposerTextarea'

const COMPOSER_ATTACHMENT_ACCEPT =
  'image/*,video/*,audio/*,.csv,.doc,.docx,.json,.pdf,.ppt,.pptx,.rtf,.txt,.xls,.xlsx,.zip,.7z'

type ComposerInputRowProps = {
  ariaDescribedBy?: string
  canSend: boolean
  canStartVoiceRecording: boolean
  disabled: boolean
  draft: string
  fileInputRef: RefObject<HTMLInputElement | null>
  isAttachmentControlDisabled: boolean
  isAttachmentSelected: boolean
  isSending: boolean
  isTextDraftTooLong: boolean
  isVoiceRecorderBusy: boolean
  isVoiceRecorderStarting: boolean
  onDraftChange: (value: string) => void
  onFileSelect: (file: File | null) => void
  onSendButtonClick: () => void
  onSendButtonPointerDown: (event: PointerEvent<HTMLButtonElement>) => void
  onStartVoiceRecording: () => void
  onSubmit: () => void
  placeholder: string
  sendButtonRef: RefObject<HTMLButtonElement | null>
  shouldPrioritizeTextDraft: boolean
  textareaRef: RefObject<HTMLTextAreaElement | null>
}

export function ComposerInputRow({
  ariaDescribedBy,
  canSend,
  canStartVoiceRecording,
  disabled,
  draft,
  fileInputRef,
  isAttachmentControlDisabled,
  isAttachmentSelected,
  isSending,
  isTextDraftTooLong,
  isVoiceRecorderBusy,
  isVoiceRecorderStarting,
  onDraftChange,
  onFileSelect,
  onSendButtonClick,
  onSendButtonPointerDown,
  onStartVoiceRecording,
  onSubmit,
  placeholder,
  sendButtonRef,
  shouldPrioritizeTextDraft,
  textareaRef,
}: ComposerInputRowProps) {
  return (
    <div className="flex items-end gap-2" data-composer-input-row>
      <input
        accept={COMPOSER_ATTACHMENT_ACCEPT}
        aria-label="Файл вложения"
        className="sr-only"
        disabled={isAttachmentControlDisabled}
        onChange={(event) => {
          onFileSelect(event.target.files?.[0] ?? null)
        }}
        ref={fileInputRef}
        type="file"
      />
      <ComposerSideControl
        control="attachment"
        isCollapsed={shouldPrioritizeTextDraft}
      >
        <ComposerSideButton
          ariaLabel="Прикрепить файл"
          disabled={isAttachmentControlDisabled}
          onClick={() => {
            fileInputRef.current?.click()
          }}
          shape="control"
          tabIndex={shouldPrioritizeTextDraft ? -1 : undefined}
          title="Прикрепить файл"
        >
          <PaperclipIcon className="h-5 w-5" />
        </ComposerSideButton>
      </ComposerSideControl>

      <ComposerTextarea
        ariaDescribedBy={ariaDescribedBy}
        disabled={disabled || isSending || isVoiceRecorderBusy}
        draft={draft}
        isInvalid={isTextDraftTooLong}
        onDraftChange={onDraftChange}
        onSubmit={onSubmit}
        placeholder={placeholder}
        textareaRef={textareaRef}
      />

      <ComposerSideControl control="voice" isCollapsed={shouldPrioritizeTextDraft}>
        <ComposerSideButton
          ariaLabel="Голосовое сообщение"
          disabled={!canStartVoiceRecording}
          onClick={onStartVoiceRecording}
          shape="round"
          tabIndex={shouldPrioritizeTextDraft ? -1 : undefined}
          title="Записать голосовое"
        >
          <MicrophoneIcon
            className={
              isVoiceRecorderStarting
                ? 'h-5 w-5 animate-pulse'
                : 'h-5 w-5'
            }
          />
        </ComposerSideButton>
      </ComposerSideControl>
      <ComposerSendButton
        canSend={canSend && !isVoiceRecorderBusy}
        isAttachmentSelected={isAttachmentSelected}
        isSending={isSending}
        onClick={onSendButtonClick}
        onPointerDown={onSendButtonPointerDown}
        sendButtonRef={sendButtonRef}
      />
    </div>
  )
}
