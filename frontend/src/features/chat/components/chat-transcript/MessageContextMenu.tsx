import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react'

import { CopyIcon, ReplyIcon } from '../../../../shared/ui/icons'
import type { ChatMessage } from '../../types'

import { getMessageCopyText, type MessageContextMenuState } from './utils'

type MessageContextMenuProps = {
  menu: NonNullable<MessageContextMenuState>
  menuRef: RefObject<HTMLDivElement | null>
  onClose: (options?: { restoreFocus?: boolean }) => void
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
  const copyButtonRef = useRef<HTMLButtonElement | null>(null)
  const replyButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (menu.focusOnOpen) {
      replyButtonRef.current?.focus({ preventScroll: true })
    }
  }, [menu.focusOnOpen, menu.message.id])

  function getEnabledMenuItems() {
    return [replyButtonRef.current, copyButtonRef.current].filter(
      (button): button is HTMLButtonElement =>
        Boolean(button && !button.disabled),
    )
  }

  function focusMenuItem(edge: 'first' | 'last') {
    const menuItems = getEnabledMenuItems()
    const nextItem = edge === 'first' ? menuItems.at(0) : menuItems.at(-1)

    nextItem?.focus({ preventScroll: true })
  }

  function moveMenuItemFocus(direction: 1 | -1) {
    const menuItems = getEnabledMenuItems()

    if (menuItems.length === 0) {
      return
    }

    const activeIndex = menuItems.findIndex(
      (menuItem) => menuItem === document.activeElement,
    )
    const nextIndex =
      activeIndex === -1
        ? 0
        : (activeIndex + direction + menuItems.length) % menuItems.length

    menuItems[nextIndex]?.focus({ preventScroll: true })
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose({ restoreFocus: true })
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveMenuItemFocus(1)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveMenuItemFocus(-1)
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      focusMenuItem('first')
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      focusMenuItem('last')
    }
  }

  return (
    <div
      className="fixed z-50 w-[184px] rounded-[0.8rem] border border-slate-200 bg-white p-1.5 text-[14px] font-medium text-slate-700 shadow-xl shadow-slate-900/10"
      data-message-context-menu
      onKeyDown={handleKeyDown}
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
        ref={replyButtonRef}
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
        ref={copyButtonRef}
        role="menuitem"
        type="button"
      >
        <CopyIcon className="h-4 w-4" />
        Копировать
      </button>
    </div>
  )
}
