import type { RefObject } from 'react'

import { CopyIcon, ReplyIcon } from '../../../../shared/ui/icons'
import type { ChatMessage } from '../../types'

import { getMessageCopyText, type MessageContextMenuState } from './utils'

type MessageContextMenuProps = {
  menu: NonNullable<MessageContextMenuState>
  menuRef: RefObject<HTMLDivElement | null>
  onClose: () => void
  onCopyMessage: (message: ChatMessage) => void
  onReplyToMessage: (message: ChatMessage) => void
}

export function MessageContextMenu({
  menu,
  menuRef,
  onClose,
  onCopyMessage,
  onReplyToMessage,
}: MessageContextMenuProps) {
  const copyText = getMessageCopyText(menu.message)

  return (
    <div
      className="fixed z-50 w-[184px] rounded-[0.8rem] border border-slate-200 bg-white p-1.5 text-[14px] font-medium text-slate-700 shadow-xl shadow-slate-900/10"
      data-chat-context-menu
      ref={menuRef}
      role="menu"
      style={{
        left: menu.x,
        top: menu.y,
      }}
    >
      <button
        className="flex min-h-10 w-full items-center gap-2 rounded-[0.65rem] px-3 text-left transition hover:bg-brand-50 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
        onClick={() => {
          onReplyToMessage(menu.message)
          onClose()
        }}
        role="menuitem"
        type="button"
      >
        <ReplyIcon className="h-4 w-4" />
        Ответить
      </button>
      <button
        className="flex min-h-10 w-full items-center gap-2 rounded-[0.65rem] px-3 text-left transition hover:bg-brand-50 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
        disabled={!copyText}
        onClick={() => {
          onCopyMessage(menu.message)
        }}
        role="menuitem"
        type="button"
      >
        <CopyIcon className="h-4 w-4" />
        Копировать
      </button>
    </div>
  )
}
