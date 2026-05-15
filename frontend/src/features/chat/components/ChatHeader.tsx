import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { cn } from '../../../shared/lib/cn'
import { createTenantMonogram } from '../../tenant/lib/tenantIdentityMetadata'
import { useTenantIdentity } from '../../tenant/lib/useTenantIdentity'
import { getAuthRequestErrorMessage } from '../../auth/lib/authErrors'
import { useAuthSession } from '../../auth/lib/authSessionContext'
import type { ChatThreadSummary } from '../types'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import {
  BellOffIcon,
  CheckIcon,
  ImageIcon,
  InfoIcon,
  LogOutIcon,
  MenuIcon,
  MoreHorizontalIcon,
  SearchIcon,
} from '../../../shared/ui/icons'

type ChatHeaderProps = {
  activeThread: ChatThreadSummary | null
  isReady: boolean
  onSelectThread: (threadId: string) => void
  selectedThreadId: string | null
  threads: ChatThreadSummary[]
}

function focusElement(element: HTMLElement | null) {
  if (element && document.contains(element)) {
    element.focus({ preventScroll: true })
  }
}

export function ChatHeader({
  activeThread,
  isReady,
  onSelectThread,
  selectedThreadId,
  threads,
}: ChatHeaderProps) {
  const navigate = useNavigate()
  const { signOut } = useAuthSession()
  const { tenant } = useTenantIdentity()
  const chatMenuButtonRef = useRef<HTMLButtonElement | null>(null)
  const chatMenuPanelRef = useRef<HTMLDivElement | null>(null)
  const chatMenuRef = useRef<HTMLDivElement | null>(null)
  const navMenuButtonRef = useRef<HTMLButtonElement | null>(null)
  const navMenuPanelRef = useRef<HTMLDivElement | null>(null)
  const navMenuRef = useRef<HTMLDivElement | null>(null)
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
        chatMenuRef.current?.contains(target) ||
        navMenuRef.current?.contains(target)
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

  const presenceLabel = isReady ? 'Онлайн' : 'Подключение'
  const supportTeamName = tenant
    ? `Команда ${tenant.displayName}`
    : 'Команда поддержки'
  const threadTitle = activeThread?.title ?? 'Личный чат'
  const threadSubtitle = activeThread?.subtitle ?? supportTeamName
  const availableThreads =
    threads.length > 0 ? threads : activeThread ? [activeThread] : []
  const tenantMonogram = tenant
    ? createTenantMonogram(tenant.displayName)
    : 'ЛК'

  return (
    <header className="app-safe-top chat-header-background relative z-30 border-b border-slate-200/90 px-4 pb-2.5 text-slate-900 shadow-sm sm:px-6 sm:pb-3">
      <div className="flex min-h-10 items-center gap-3">
        <div className="relative shrink-0" ref={navMenuRef}>
          <button
            aria-expanded={isNavMenuOpen}
            aria-haspopup="menu"
            aria-label={
              isNavMenuOpen ? 'Закрыть навигацию' : 'Открыть навигацию'
            }
            className="inline-flex h-10 w-10 items-center justify-center rounded-chat-control text-slate-600 transition hover:bg-slate-100/80 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
            onClick={() => {
              setIsNavMenuOpen((currentValue) => !currentValue)
              setIsChatMenuOpen(false)
            }}
            ref={navMenuButtonRef}
            title="Меню"
            type="button"
          >
            <MenuIcon className="h-6 w-6" />
          </button>

          {isNavMenuOpen ? (
            <div
              className="portal-menu-surface absolute left-0 top-[calc(100%+0.5rem)] z-50 w-52 overflow-hidden rounded-chat-nav-menu border border-slate-200/80 p-1.5 text-sm text-slate-700 shadow-chat-nav-menu"
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

                return (
                  <button
                    aria-current={isSelected ? 'page' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-[0.6rem] px-3 py-2 text-left transition',
                      isSelected
                        ? 'font-medium text-brand-800'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100',
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
                    <span className="min-w-0 truncate">{thread.title}</span>
                  </button>
                )
              })}
              <button
                aria-disabled="true"
                className="mt-1 flex w-full items-center justify-between rounded-[0.6rem] px-3 py-2 text-left text-slate-500"
                disabled
                role="menuitem"
                type="button"
              >
                <span>Центр поддержки</span>
                <span className="text-xs text-slate-400">скоро</span>
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.85rem] bg-brand-900 text-sm font-semibold tracking-wide text-white">
          {tenantMonogram}
        </div>

        <div className="min-w-0 flex-1 py-0.5">
          <h1 className="truncate text-[16px] font-semibold leading-tight text-slate-900 sm:text-[17px]">
            {threadTitle}
          </h1>
          <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[12px] leading-4 text-slate-500 sm:text-[13px]">
            <span className="min-w-0 truncate">{threadSubtitle}</span>
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#76a878] shadow-[0_0_0_2px_rgb(118_168_120_/_0.14)]"
            />
            <span
              aria-label={presenceLabel}
              className="shrink-0 font-normal text-[#5f8b62]"
              role="status"
              title={presenceLabel}
            >
              {presenceLabel}
            </span>
          </div>
        </div>

        <div className="relative shrink-0" ref={chatMenuRef}>
          <button
            aria-expanded={isChatMenuOpen}
            aria-haspopup="menu"
            aria-label={
              isChatMenuOpen ? 'Закрыть меню чата' : 'Открыть меню чата'
            }
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/60 bg-slate-50/60 text-slate-500 transition hover:border-slate-300/80 hover:bg-slate-100/80 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
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

          {isChatMenuOpen ? (
            <div
              className="portal-menu-surface absolute right-0 top-[calc(100%+0.5rem)] z-50 w-max max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-chat-menu border border-slate-200/90 p-2 text-slate-700 shadow-chat-menu"
              onKeyDown={handleMenuKeyDown}
              ref={chatMenuPanelRef}
              role="menu"
              tabIndex={-1}
            >
              <ChatMenuItem
                icon={<SearchIcon className="h-5 w-5" />}
                label="Поиск по чату"
              />
              <ChatMenuItem
                icon={<ImageIcon className="h-5 w-5" />}
                label="Медиа и файлы"
              />
              <ChatMenuItem
                icon={<BellOffIcon className="h-5 w-5" />}
                label="Отключить уведомления"
              />
              <ChatMenuItem
                icon={<InfoIcon className="h-5 w-5" />}
                label="Информация о чате"
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
      </div>

      {logoutError ? (
        <div className="mt-2 sm:mt-3">
          <InlineAlert message={logoutError} tone="error" />
        </div>
      ) : null}
    </header>
  )
}

function ChatMenuItem({
  destructive = false,
  disabled = false,
  icon,
  label,
  onSelect,
}: {
  destructive?: boolean
  disabled?: boolean
  icon: ReactNode
  label: string
  onSelect?: () => void
}) {
  const isDisabled = disabled || !onSelect

  return (
    <button
      aria-disabled={isDisabled ? true : undefined}
      className={[
        'flex min-h-10 w-full items-center gap-3 whitespace-nowrap border-b border-slate-200/80 px-1 py-2 text-left text-[15px] leading-5 transition last:border-b-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60',
        destructive
          ? 'text-red-600 hover:text-red-700'
          : 'text-slate-700 hover:text-brand-800',
      ].join(' ')}
      disabled={isDisabled}
      onClick={onSelect}
      role="menuitem"
      type="button"
    >
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  )
}
