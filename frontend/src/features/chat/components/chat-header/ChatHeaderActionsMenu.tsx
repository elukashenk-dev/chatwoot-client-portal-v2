import type { KeyboardEventHandler, RefObject } from 'react'

import type { ChatNotificationSettings } from '../../types'
import { ChatMenuItem } from '../ChatMenuItem'
import {
  BellIcon,
  BellOffIcon,
  DownloadIcon,
  ImageIcon,
  InfoIcon,
  LogOutIcon,
  SearchIcon,
  UserIcon,
} from '../../../../shared/ui/icons'

type ChatHeaderActionsMenuProps = {
  isLoggingOut: boolean
  menuRef: RefObject<HTMLDivElement | null>
  notificationsStatus: string
  onInstallApp?: () => void
  onKeyDown: KeyboardEventHandler<HTMLDivElement>
  onLogout: () => void
  onOpenProfile: () => void
  onOpenThreadInfo: () => void
  onOpenThreadMedia: () => void
  onOpenThreadNotifications: () => void
  onOpenThreadSearch: () => void
  selectedThreadId: string | null
  threadNotificationSettings: ChatNotificationSettings | null
}

export function ChatHeaderActionsMenu({
  isLoggingOut,
  menuRef,
  notificationsStatus,
  onInstallApp,
  onKeyDown,
  onLogout,
  onOpenProfile,
  onOpenThreadInfo,
  onOpenThreadMedia,
  onOpenThreadNotifications,
  onOpenThreadSearch,
  selectedThreadId,
  threadNotificationSettings,
}: ChatHeaderActionsMenuProps) {
  const isThreadActionDisabled = !selectedThreadId

  return (
    <div
      className="portal-menu-surface absolute right-3 top-[calc(100%+0.5rem)] z-50 w-max max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-chat-menu border border-white/65 p-2 text-slate-700 shadow-chat-menu sm:right-4"
      data-chat-header-menu="actions"
      onKeyDown={onKeyDown}
      ref={menuRef}
      role="menu"
      tabIndex={-1}
    >
      <div className="px-1 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-normal text-slate-400">
        Аккаунт
      </div>
      <ChatMenuItem
        icon={<UserIcon className="h-5 w-5" />}
        label="Профиль"
        onSelect={onOpenProfile}
      />
      {onInstallApp ? (
        <ChatMenuItem
          icon={<DownloadIcon className="h-5 w-5" />}
          label="Установить приложение"
          onSelect={onInstallApp}
        />
      ) : null}
      <div className="px-1 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-normal text-slate-400">
        Чат
      </div>
      <ChatMenuItem
        disabled={isThreadActionDisabled}
        icon={<SearchIcon className="h-5 w-5" />}
        label="Поиск по чату"
        onSelect={onOpenThreadSearch}
      />
      <ChatMenuItem
        disabled={isThreadActionDisabled}
        icon={<ImageIcon className="h-5 w-5" />}
        label="Медиа и файлы"
        onSelect={onOpenThreadMedia}
      />
      <ChatMenuItem
        disabled={isThreadActionDisabled}
        icon={
          threadNotificationSettings?.effective.newMessagesEnabled === false ? (
            <BellOffIcon className="h-5 w-5" />
          ) : (
            <BellIcon className="h-5 w-5" />
          )
        }
        label="Уведомления"
        onSelect={onOpenThreadNotifications}
        secondaryLabel={notificationsStatus}
      />
      <ChatMenuItem
        disabled={isThreadActionDisabled}
        icon={<InfoIcon className="h-5 w-5" />}
        label="Информация о чате"
        onSelect={onOpenThreadInfo}
      />
      <ChatMenuItem
        destructive
        disabled={isLoggingOut}
        icon={
          <LogOutIcon
            className={isLoggingOut ? 'h-5 w-5 animate-pulse' : 'h-5 w-5'}
          />
        }
        label={isLoggingOut ? 'Завершаем...' : 'Завершить диалог'}
        onSelect={onLogout}
      />
    </div>
  )
}
