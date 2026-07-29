import type { PointerEvent, RefObject } from 'react'

import { MicrophoneIcon } from '../../../../shared/ui/icons'
import type { AttachmentDraftSource } from '../../lib/attachmentDraft'
import { ComposerAttachmentMenu } from './ComposerAttachmentMenu'
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
  isAttachmentControlDisabled: boolean
  isAttachmentSelected: boolean
  isSending: boolean
  isTextDraftTooLong: boolean
  isVoiceRecorderBusy: boolean
  isVoiceRecorderStarting: boolean
  onDraftChange: (value: string) => void
  onFilesSelect: (
    files: readonly File[],
    source?: AttachmentDraftSource,
  ) => void
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
      <ComposerSideControl
        control="attachment"
        isCollapsed={shouldPrioritizeTextDraft}
      >
        <ComposerAttachmentMenu
          disabled={isAttachmentControlDisabled}
          onFilesSelected={onFilesSelect}
          tabIndex={shouldPrioritizeTextDraft ? -1 : undefined}
        />
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
