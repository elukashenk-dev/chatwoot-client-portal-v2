import type { RefObject } from 'react'

import {
  MicrophoneIcon,
  PaperclipIcon,
  SendIcon,
  SmileIcon,
} from '../../../../shared/ui/icons'
import { ComposerSideControl } from './ComposerSideControl'
import { EmojiPicker } from './EmojiPicker'
import type { VoiceRecorderStatus } from './types'

type ComposerInputRowProps = {
  canSend: boolean
  canStartVoiceRecording: boolean
  disabled: boolean
  draft: string
  emojiButtonRef: RefObject<HTMLButtonElement | null>
  fileInputRef: RefObject<HTMLInputElement | null>
  isAttachmentControlDisabled: boolean
  isEmojiControlDisabled: boolean
  isEmojiPickerOpen: boolean
  isSending: boolean
  isVoiceRecordingActive: boolean
  onChangeDraft: (draft: string) => void
  onInsertEmoji: (emoji: string) => void
  onInsertPhrase: (text: string) => void
  onSelectAttachment: (file: File | null) => void
  onStartVoiceRecording: () => void
  onSubmitCurrentDraft: () => void
  onToggleEmojiPicker: () => void
  selectedAttachment: File | null
  shouldHideIdleControls: boolean
  shouldShowSendControl: boolean
  textareaRef: RefObject<HTMLTextAreaElement | null>
  voiceRecorderStatus: VoiceRecorderStatus
}

export function ComposerInputRow({
  canSend,
  canStartVoiceRecording,
  disabled,
  draft,
  emojiButtonRef,
  fileInputRef,
  isAttachmentControlDisabled,
  isEmojiControlDisabled,
  isEmojiPickerOpen,
  isSending,
  isVoiceRecordingActive,
  onChangeDraft,
  onInsertEmoji,
  onInsertPhrase,
  onSelectAttachment,
  onStartVoiceRecording,
  onSubmitCurrentDraft,
  onToggleEmojiPicker,
  selectedAttachment,
  shouldHideIdleControls,
  shouldShowSendControl,
  textareaRef,
  voiceRecorderStatus,
}: ComposerInputRowProps) {
  const shouldCollapseAttachment =
    shouldHideIdleControls || isVoiceRecordingActive
  const shouldCollapseSend = !shouldShowSendControl || isVoiceRecordingActive
  const shouldCollapseVoice = shouldHideIdleControls || isVoiceRecordingActive

  return (
    <>
      <div className="flex items-end gap-2">
        <input
          accept="image/*,video/*,audio/*,.csv,.doc,.docx,.json,.pdf,.ppt,.pptx,.rtf,.txt,.xls,.xlsx,.zip,.7z"
          aria-label="Файл вложения"
          className="sr-only"
          disabled={isAttachmentControlDisabled}
          onChange={(event) => {
            onSelectAttachment(event.target.files?.[0] ?? null)
          }}
          ref={fileInputRef}
          type="file"
        />
        <ComposerSideControl
          control="attachment"
          isCollapsed={shouldCollapseAttachment}
        >
          <button
            aria-label="Прикрепить файл"
            className="inline-flex h-11 w-11 items-center justify-center rounded-[0.75rem] text-slate-500 transition hover:bg-white hover:text-chat-outgoing focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:text-slate-300"
            disabled={isAttachmentControlDisabled}
            onClick={() => {
              fileInputRef.current?.click()
            }}
            tabIndex={shouldCollapseAttachment ? -1 : undefined}
            title="Прикрепить файл"
            type="button"
          >
            <PaperclipIcon className="h-[18px] w-[18px]" />
          </button>
        </ComposerSideControl>

        <textarea
          aria-label="Сообщение"
          className="max-h-32 min-h-[44px] min-w-0 flex-1 resize-none overflow-hidden border-0 bg-transparent px-2 py-2 text-[15px] leading-6 text-slate-800 shadow-none outline-none placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-0 focus-visible:outline-none disabled:text-slate-400"
          disabled={disabled || isSending || voiceRecorderStatus !== 'idle'}
          onChange={(event) => {
            onChangeDraft(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              onSubmitCurrentDraft()
            }
          }}
          placeholder={disabled ? 'Чат временно недоступен' : 'Сообщение...'}
          ref={textareaRef}
          rows={1}
          value={draft}
        />

        <ComposerSideControl
          control="emoji"
          isCollapsed={isVoiceRecordingActive}
        >
          <button
            aria-controls="message-composer-emoji-picker"
            aria-expanded={isEmojiPickerOpen}
            aria-haspopup="dialog"
            aria-label="Добавить эмоджи"
            className="inline-flex h-11 w-11 items-center justify-center rounded-[0.75rem] text-slate-500 transition hover:bg-white hover:text-chat-outgoing focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:text-slate-300"
            disabled={isEmojiControlDisabled}
            onClick={onToggleEmojiPicker}
            ref={emojiButtonRef}
            tabIndex={isVoiceRecordingActive ? -1 : undefined}
            title="Добавить эмоджи"
            type="button"
          >
            <SmileIcon className="h-[18px] w-[18px]" />
          </button>
        </ComposerSideControl>

        <ComposerSideControl control="voice" isCollapsed={shouldCollapseVoice}>
          <button
            aria-label="Голосовое сообщение"
            className="inline-flex h-11 w-11 items-center justify-center rounded-[0.75rem] text-slate-500 transition hover:bg-white hover:text-chat-outgoing focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:text-slate-300"
            disabled={!canStartVoiceRecording}
            onClick={onStartVoiceRecording}
            tabIndex={shouldCollapseVoice ? -1 : undefined}
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
        </ComposerSideControl>

        <ComposerSideControl control="send" isCollapsed={shouldCollapseSend}>
          <button
            aria-label={
              isSending
                ? 'Отправляем'
                : selectedAttachment
                  ? 'Отправить файл'
                  : 'Отправить'
            }
            className="inline-flex h-11 w-11 items-center justify-center rounded-[0.75rem] bg-chat-outgoing text-white transition hover:bg-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-200"
            disabled={!canSend || voiceRecorderStatus !== 'idle'}
            onClick={onSubmitCurrentDraft}
            tabIndex={shouldCollapseSend ? -1 : undefined}
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
        </ComposerSideControl>
      </div>

      {isEmojiPickerOpen ? (
        <div id="message-composer-emoji-picker">
          <EmojiPicker
            disabled={isEmojiControlDisabled}
            onInsertEmoji={onInsertEmoji}
            onInsertPhrase={onInsertPhrase}
          />
        </div>
      ) : null}
    </>
  )
}
