import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { createTenantMonogram } from '../../tenant/lib/tenantIdentityMetadata'
import { useTenantIdentity } from '../../tenant/lib/useTenantIdentity'
import { getAuthRequestErrorMessage } from '../../auth/lib/authErrors'
import { useAuthSession } from '../../auth/lib/authSessionContext'
import { useBranding } from '../../branding/lib/useBranding'
import { getChatNotificationsStatus } from '../lib/notificationSettingsPresentation'
import { getSupportAvailabilityPresentation } from '../lib/chatSupportAvailability'
import {
  hasUnreadOutsideSelectedThread,
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
import { ChatHeaderActionsMenu } from './chat-header/ChatHeaderActionsMenu'
import { ChatHeaderNavigationMenu } from './chat-header/ChatHeaderNavigationMenu'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import { MenuIcon, MoreHorizontalIcon } from '../../../shared/ui/icons'

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
        <div
          className="chat-floating-header-surface flex min-h-14 w-full items-center gap-3 rounded-[10px] border px-3 py-[9px] sm:min-h-[3.75rem] sm:px-4"
          data-chat-floating-surface="header"
        >
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
          <ChatHeaderNavigationMenu
            availableThreads={availableThreads}
            menuRef={navMenuPanelRef}
            onKeyDown={handleMenuKeyDown}
            onOpenSettings={() => {
              setIsNavMenuOpen(false)
              navigate(routePaths.app.settings)
            }}
            onSelectThread={(threadId) => {
              onSelectThread(threadId)
              setIsNavMenuOpen(false)
            }}
            selectedThreadId={selectedThreadId}
          />
        ) : null}

        {isChatMenuOpen ? (
          <ChatHeaderActionsMenu
            isLoggingOut={isLoggingOut}
            menuRef={chatMenuPanelRef}
            notificationsStatus={notificationsStatus}
            onKeyDown={handleMenuKeyDown}
            onLogout={() => {
              void handleLogout()
            }}
            onOpenProfile={() => {
              closeMenus()
              navigate(routePaths.app.profile)
            }}
            onOpenThreadInfo={() => {
              closeMenus()
              onOpenThreadInfo()
            }}
            onOpenThreadMedia={() => {
              closeMenus()
              onOpenThreadMedia()
            }}
            onOpenThreadNotifications={() => {
              closeMenus()
              onOpenThreadNotifications()
            }}
            onOpenThreadSearch={() => {
              closeMenus()
              onOpenThreadSearch()
            }}
            selectedThreadId={selectedThreadId}
            threadNotificationSettings={threadNotificationSettings}
          />
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
