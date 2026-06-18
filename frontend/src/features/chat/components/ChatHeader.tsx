import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { cn } from '../../../shared/lib/cn'
import { createTenantMonogram } from '../../tenant/lib/tenantIdentityMetadata'
import { useTenantIdentity } from '../../tenant/lib/useTenantIdentity'
import { getAuthRequestErrorMessage } from '../../auth/lib/authErrors'
import { useAuthSession } from '../../auth/lib/authSessionContext'
import { useBranding } from '../../branding/lib/useBranding'
import { getChatNotificationsStatus } from '../lib/notificationSettingsPresentation'
import { getSupportAvailabilityPresentation } from '../lib/chatSupportAvailability'
import {
  formatUnreadCount,
  hasUnreadOutsideSelectedThread,
  readThreadUnreadCount,
} from '../lib/chatUnreadPresentation'
import { resolveThreadIdentityAvatarUrl } from '../lib/threadIdentityAvatar'
import type {
  ChatNotificationSettings,
  ChatSupportAvailabilityResponse,
  ChatThreadListSummary,
  ChatThreadSummary,
} from '../types'
import { type ChatHeaderPresenceTone } from './ChatHeaderPresence'
import { ChatHeaderIdentity } from './ChatHeaderIdentity'
import { ChatMenuItem } from './ChatMenuItem'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import {
  BellIcon,
  BellOffIcon,
  CheckIcon,
  ImageIcon,
  InfoIcon,
  LogOutIcon,
  MenuIcon,
  MoreHorizontalIcon,
  SearchIcon,
  SettingsIcon,
  UserIcon,
} from '../../../shared/ui/icons'

type ChatHeaderProps = {
  activeThread: ChatThreadSummary | null
  connectionStatus: 'connecting' | 'offline' | 'online'
  onOpenThreadInfo: () => void
  onOpenThreadMedia: () => void
  onOpenThreadNotifications: () => void
  onOpenThreadSearch: () => void
  onSelectThread: (threadId: string) => void
  selectedThreadId: string | null
  supportAvailability: ChatSupportAvailabilityResponse | null
  threadNotificationSettings: ChatNotificationSettings | null
  threads: ChatThreadListSummary[]
}

function focusElement(element: HTMLElement | null) {
  if (element && document.contains(element)) {
    element.focus({ preventScroll: true })
  }
}

export function ChatHeader({
  activeThread,
  connectionStatus,
  onOpenThreadInfo,
  onOpenThreadMedia,
  onOpenThreadNotifications,
  onOpenThreadSearch,
  onSelectThread,
  selectedThreadId,
  supportAvailability,
  threadNotificationSettings,
  threads,
}: ChatHeaderProps) {
  const navigate = useNavigate()
  const { signOut } = useAuthSession()
  const { branding } = useBranding()
  const { tenant } = useTenantIdentity()
  const chatMenuButtonRef = useRef<HTMLButtonElement | null>(null)
  const chatMenuPanelRef = useRef<HTMLDivElement | null>(null)
  const navMenuButtonRef = useRef<HTMLButtonElement | null>(null)
  const navMenuPanelRef = useRef<HTMLDivElement | null>(null)
  const [isChatMenuOpen, setIsChatMenuOpen] = useState(false)
  const [isNavMenuOpen, setIsNavMenuOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)

  const closeMenus = useCallback(
    ({
      restoreFocus = false,
    }: {
      restoreFocus?: boolean
    } = {}) => {
      const shouldRestoreChatFocus = restoreFocus && isChatMenuOpen
      const shouldRestoreNavFocus = restoreFocus && isNavMenuOpen

      setIsChatMenuOpen(false)
      setIsNavMenuOpen(false)

      if (shouldRestoreChatFocus) {
        focusElement(chatMenuButtonRef.current)
        return
      }

      if (shouldRestoreNavFocus) {
        focusElement(navMenuButtonRef.current)
      }
    },
    [isChatMenuOpen, isNavMenuOpen],
  )

  useEffect(() => {
    if (!isChatMenuOpen && !isNavMenuOpen) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target

      if (!(target instanceof Node)) {
        return
      }

      if (
        chatMenuButtonRef.current?.contains(target) ||
        chatMenuPanelRef.current?.contains(target) ||
        navMenuButtonRef.current?.contains(target) ||
        navMenuPanelRef.current?.contains(target)
      ) {
        return
      }

      closeMenus()
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMenus({ restoreFocus: true })
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeMenus, isChatMenuOpen, isNavMenuOpen])

  useEffect(() => {
    if (isChatMenuOpen) {
      chatMenuPanelRef.current?.focus({ preventScroll: true })
    }
  }, [isChatMenuOpen])

  useEffect(() => {
    if (isNavMenuOpen) {
      navMenuPanelRef.current?.focus({ preventScroll: true })
    }
  }, [isNavMenuOpen])

  function focusMenuItem(menuElement: HTMLDivElement, edge: 'first' | 'last') {
    const menuItems = Array.from(
      menuElement.querySelectorAll<HTMLButtonElement>(
        'button[role="menuitem"]:not(:disabled)',
      ),
    )
    const nextMenuItem = edge === 'first' ? menuItems.at(0) : menuItems.at(-1)

    nextMenuItem?.focus({ preventScroll: true })
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeMenus({ restoreFocus: true })
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'Home') {
      event.preventDefault()
      focusMenuItem(event.currentTarget, 'first')
      return
    }

    if (event.key === 'ArrowUp' || event.key === 'End') {
      event.preventDefault()
      focusMenuItem(event.currentTarget, 'last')
    }
  }

  async function handleLogout() {
    setIsLoggingOut(true)
    setLogoutError(null)

    try {
      await signOut()
      navigate(routePaths.auth.login, { replace: true })
    } catch (error) {
      setLogoutError(getAuthRequestErrorMessage(error))
    } finally {
      setIsLoggingOut(false)
    }
  }

  const supportPresence: {
    label: string
    tone: ChatHeaderPresenceTone
  } =
    connectionStatus === 'online'
      ? getSupportAvailabilityPresentation(supportAvailability)
      : connectionStatus === 'connecting'
        ? {
            label: 'Соединение...',
            tone: 'checking',
          }
        : {
            label: 'Нет связи',
            tone: 'offline',
          }
  const supportTeamName = branding.supportLabel
  const threadTitle = activeThread?.title ?? 'Личный чат'
  const threadSubtitle = activeThread?.subtitle.trim() || supportTeamName
  const availableThreads =
    threads.length > 0 ? threads : activeThread ? [activeThread] : []
  const hasOtherThreadUnread = hasUnreadOutsideSelectedThread(
    availableThreads,
    selectedThreadId,
  )
  const tenantMonogram = createTenantMonogram(
    branding.portalName || tenant?.displayName || 'ЛК',
  )
  const notificationsStatus = getChatNotificationsStatus(
    threadNotificationSettings,
  )

  return (
    <header className="app-safe-top relative z-30 bg-transparent px-3 pb-2 text-[color:var(--portal-chat-header-foreground,#0f172a)] sm:px-6 sm:pb-3">
      <div className="relative mx-auto w-full max-w-[620px]">
        <div className="chat-floating-header-surface flex min-h-14 w-full items-center gap-3 rounded-[10px] border px-3 py-[9px] sm:min-h-[3.75rem] sm:px-4">
          <div className="relative shrink-0">
            <button
              aria-expanded={isNavMenuOpen}
              aria-haspopup="menu"
              aria-label={
                isNavMenuOpen ? 'Закрыть навигацию' : 'Открыть навигацию'
              }
              className="chat-header-icon-button inline-flex h-10 w-10 items-center justify-center rounded-chat-control transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
              onClick={() => {
                setIsNavMenuOpen((currentValue) => !currentValue)
                setIsChatMenuOpen(false)
              }}
              ref={navMenuButtonRef}
              title="Меню"
              type="button"
            >
              <MenuIcon className="h-6 w-6" />
              {hasOtherThreadUnread ? (
                <span
                  aria-hidden="true"
                  className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 shadow-[0_0_0_2px_rgb(239_68_68_/_0.18)]"
                  data-testid="chat-menu-unread-dot"
                />
              ) : null}
            </button>
          </div>

          <ChatHeaderIdentity
            avatarFallback={tenantMonogram}
            avatarUrl={resolveThreadIdentityAvatarUrl({
              brandingLogoUrl: branding.assets.logo?.publicUrl,
              threadAvatarUrl: activeThread?.avatarUrl,
            })}
            presenceLabel={supportPresence.label}
            presenceTone={supportPresence.tone}
            subtitle={threadSubtitle}
            title={threadTitle}
          />

          <div className="relative shrink-0">
            <button
              aria-expanded={isChatMenuOpen}
              aria-haspopup="menu"
              aria-label={
                isChatMenuOpen ? 'Закрыть меню чата' : 'Открыть меню чата'
              }
              className="chat-header-menu-button inline-flex h-10 w-10 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
              onClick={() => {
                setIsChatMenuOpen((currentValue) => !currentValue)
                setIsNavMenuOpen(false)
              }}
              ref={chatMenuButtonRef}
              title="Меню чата"
              type="button"
            >
              <MoreHorizontalIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {isNavMenuOpen ? (
          <div
            className="portal-menu-surface absolute left-3 top-[calc(100%+0.5rem)] z-50 w-52 overflow-hidden rounded-chat-nav-menu border border-white/65 p-1.5 text-sm text-slate-700 shadow-chat-nav-menu sm:left-4"
            onKeyDown={handleMenuKeyDown}
            ref={navMenuPanelRef}
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
                    setIsNavMenuOpen(false)
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
              className="mt-1 flex w-full items-center gap-2 rounded-[0.6rem] px-3 py-2 text-left text-slate-600 transition hover:bg-white/45 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
              onClick={() => {
                setIsNavMenuOpen(false)
                navigate(routePaths.app.settings)
              }}
              role="menuitem"
              type="button"
            >
              <SettingsIcon className="h-4 w-4 shrink-0" />
              <span>Настройки</span>
            </button>
          </div>
        ) : null}

        {isChatMenuOpen ? (
          <div
            className="portal-menu-surface absolute right-3 top-[calc(100%+0.5rem)] z-50 w-max max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-chat-menu border border-white/65 p-2 text-slate-700 shadow-chat-menu sm:right-4"
            onKeyDown={handleMenuKeyDown}
            ref={chatMenuPanelRef}
            role="menu"
            tabIndex={-1}
          >
              <div className="px-1 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-normal text-slate-400">
                Аккаунт
              </div>
              <ChatMenuItem
                icon={<UserIcon className="h-5 w-5" />}
                label="Профиль"
                onSelect={() => {
                  closeMenus()
                  navigate(routePaths.app.profile)
                }}
              />
              <div className="px-1 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-normal text-slate-400">
                Чат
              </div>
              <ChatMenuItem
                disabled={!selectedThreadId}
                icon={<SearchIcon className="h-5 w-5" />}
                label="Поиск по чату"
                onSelect={() => {
                  closeMenus()
                  onOpenThreadSearch()
                }}
              />
              <ChatMenuItem
                disabled={!selectedThreadId}
                icon={<ImageIcon className="h-5 w-5" />}
                label="Медиа и файлы"
                onSelect={() => {
                  closeMenus()
                  onOpenThreadMedia()
                }}
              />
              <ChatMenuItem
                disabled={!selectedThreadId}
                icon={
                  threadNotificationSettings?.effective.newMessagesEnabled ===
                  false ? (
                    <BellOffIcon className="h-5 w-5" />
                  ) : (
                    <BellIcon className="h-5 w-5" />
                  )
                }
                label="Уведомления"
                onSelect={() => {
                  closeMenus()
                  onOpenThreadNotifications()
                }}
                secondaryLabel={notificationsStatus}
              />
              <ChatMenuItem
                disabled={!selectedThreadId}
                icon={<InfoIcon className="h-5 w-5" />}
                label="Информация о чате"
                onSelect={() => {
                  closeMenus()
                  onOpenThreadInfo()
                }}
              />
              <ChatMenuItem
                destructive
                disabled={isLoggingOut}
                icon={
                  <LogOutIcon
                    className={
                      isLoggingOut ? 'h-5 w-5 animate-pulse' : 'h-5 w-5'
                    }
                  />
                }
                label={isLoggingOut ? 'Завершаем...' : 'Завершить диалог'}
                onSelect={() => {
                  void handleLogout()
                }}
              />
          </div>
        ) : null}
      </div>

      {logoutError ? (
        <div className="mx-auto mt-2 w-full max-w-[620px] sm:mt-3">
          <InlineAlert message={logoutError} tone="error" />
        </div>
      ) : null}
    </header>
  )
}
