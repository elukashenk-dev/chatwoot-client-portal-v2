import type { KeyboardEventHandler, RefObject } from 'react'

import { cn } from '../../../../shared/lib/cn'
import {
  formatUnreadCount,
  readThreadUnreadCount,
} from '../../lib/chatUnreadPresentation'
import type { ChatThreadSummary } from '../../types'
import { CheckIcon, SettingsIcon } from '../../../../shared/ui/icons'

type ChatHeaderNavigationMenuProps = {
  availableThreads: ChatThreadSummary[]
  menuRef: RefObject<HTMLDivElement | null>
  onKeyDown: KeyboardEventHandler<HTMLDivElement>
  onOpenSettings: () => void
  onSelectThread: (threadId: string) => void
  selectedThreadId: string | null
}

export function ChatHeaderNavigationMenu({
  availableThreads,
  menuRef,
  onKeyDown,
  onOpenSettings,
  onSelectThread,
  selectedThreadId,
}: ChatHeaderNavigationMenuProps) {
  return (
    <div
      className="portal-menu-surface absolute left-3 top-[calc(100%+0.5rem)] z-50 w-52 overflow-hidden rounded-chat-nav-menu border border-white/65 p-1.5 text-sm text-slate-700 shadow-chat-nav-menu sm:left-4"
      data-chat-header-menu="navigation"
      onKeyDown={onKeyDown}
      ref={menuRef}
      role="menu"
      tabIndex={-1}
    >
      <div className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-slate-400">
        Чаты
      </div>
      {availableThreads.map((thread) => {
        const isSelected = thread.id === selectedThreadId
        const unreadCount = readThreadUnreadCount(thread)
        const hasUnread = unreadCount > 0

        return (
          <button
            aria-current={isSelected ? 'page' : undefined}
            className={cn(
              'flex w-full items-center gap-2 rounded-[0.6rem] px-3 py-2 text-left transition',
              isSelected
                ? 'font-medium text-brand-800'
                : 'text-slate-600 hover:bg-white/45 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100',
            )}
            disabled={isSelected}
            key={thread.id}
            onClick={() => {
              onSelectThread(thread.id)
            }}
            role="menuitem"
            type="button"
          >
            {isSelected ? (
              <CheckIcon className="h-4 w-4 shrink-0" />
            ) : (
              <span className="h-4 w-4 shrink-0" />
            )}
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="min-w-0 truncate">{thread.title}</span>
              {hasUnread ? (
                <span
                  aria-label={`${thread.title}, ${unreadCount} непрочитанных`}
                  className="ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white"
                  data-testid={`thread-unread-badge-${thread.id}`}
                >
                  {formatUnreadCount(unreadCount)}
                </span>
              ) : null}
            </span>
          </button>
        )
      })}
      <button
        aria-disabled="true"
        className="mt-1 flex w-full cursor-not-allowed items-center gap-2 rounded-[0.6rem] px-3 py-2 text-left text-slate-400"
        disabled
        role="menuitem"
        type="button"
      >
        <span className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Центр поддержки - скоро</span>
      </button>
      <button
        className="mt-1 flex w-full items-center gap-2 rounded-[0.6rem] px-3 py-2 text-left text-slate-600 transition hover:bg-white/45 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
        onClick={onOpenSettings}
        role="menuitem"
        type="button"
      >
        <SettingsIcon className="h-4 w-4 shrink-0" />
        <span>Настройки</span>
      </button>
    </div>
  )
}
