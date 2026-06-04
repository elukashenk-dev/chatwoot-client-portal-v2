import type { PointerEvent, RefObject } from 'react'

import { SendIcon } from '../../../../shared/ui/icons'

type ComposerSendButtonProps = {
  canSend: boolean
  isAttachmentSelected: boolean
  isSending: boolean
  onClick: () => void
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void
  sendButtonRef: RefObject<HTMLButtonElement | null>
}

export function ComposerSendButton({
  canSend,
  isAttachmentSelected,
  isSending,
  onClick,
  onPointerDown,
  sendButtonRef,
}: ComposerSendButtonProps) {
  return (
    <button
      aria-label={
        isSending
          ? 'Отправляем'
          : isAttachmentSelected
            ? 'Отправить файл'
            : 'Отправить'
      }
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-chat-control bg-chat-outgoing text-white transition hover:bg-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-200"
      disabled={!canSend}
      onClick={onClick}
      onPointerDown={onPointerDown}
      ref={sendButtonRef}
      title="Отправить"
      type="button"
    >
      <SendIcon
        className={
          isSending ? 'h-[18px] w-[18px] animate-pulse' : 'h-[18px] w-[18px]'
        }
      />
    </button>
  )
}
