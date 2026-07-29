import type { PointerEvent, RefObject } from 'react'

import { MicrophoneIcon, PaperclipIcon } from '../../../../shared/ui/icons'
import { COMPOSER_ATTACHMENT_ACCEPT } from '../../lib/attachmentDraft'
import { ComposerSendButton } from './ComposerSendButton'
import { ComposerSideButton } from './ComposerSideButton'
import { ComposerSideControl } from './ComposerSideControl'
import { ComposerTextarea } from './ComposerTextarea'

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
  onFilesSelect: (files: readonly File[]) => void
  onPasteFiles: (files: readonly File[]) => boolean
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
  onFilesSelect,
  onPasteFiles,
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
          const files = Array.from(event.currentTarget.files ?? [])

          event.currentTarget.value = ''
          onFilesSelect(files)
        }}
        multiple
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
        onPasteFiles={onPasteFiles}
        onSubmit={onSubmit}
        placeholder={placeholder}
        textareaRef={textareaRef}
      />

      <ComposerSideControl
        control="voice"
        isCollapsed={shouldPrioritizeTextDraft}
      >
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
              isVoiceRecorderStarting ? 'h-5 w-5 animate-pulse' : 'h-5 w-5'
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
