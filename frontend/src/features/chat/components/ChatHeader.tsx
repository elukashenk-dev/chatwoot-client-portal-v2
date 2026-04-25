import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { getAuthRequestErrorMessage } from '../../auth/lib/authErrors'
import { useAuthSession } from '../../auth/lib/authSessionContext'
import type { ChatPrimaryConversation } from '../types'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import { LogOutIcon, MenuIcon } from '../../../shared/ui/icons'

type ChatHeaderProps = {
  conversation: ChatPrimaryConversation | null
  isReady: boolean
}

export function ChatHeader({ conversation, isReady }: ChatHeaderProps) {
  const navigate = useNavigate()
  const { signOut } = useAuthSession()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)

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

  return (
    <header className="app-safe-top chat-header-background relative z-10 border-b border-slate-200/90 px-4 pb-2.5 text-slate-900 shadow-sm sm:px-6 sm:pb-3">
      <div className="flex min-h-10 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            aria-label="Меню"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.7rem] text-slate-600 transition hover:bg-slate-100/70 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-default"
            disabled
            title="Меню"
            type="button"
          >
            <MenuIcon className="h-6 w-6" />
          </button>

          <div className="flex min-w-0 items-center gap-[15px]">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.85rem] bg-brand-900 text-sm font-semibold tracking-wide text-white">
              PG
            </div>

            <div className="min-w-0 py-0.5">
              <h1 className="truncate text-[16px] font-semibold text-slate-900 sm:text-[17px]">
                Поддержка клиентов
              </h1>
              <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[12px] text-slate-500 sm:mt-1 sm:text-[13px]">
                <span className="min-w-0 truncate">
                  Агент: {conversation?.assigneeName ?? 'Команда ProvGroup'}
                </span>
                <span
                  aria-label={presenceLabel}
                  className="inline-flex shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium leading-4 text-emerald-700"
                  role="status"
                  title={presenceLabel}
                >
                  {presenceLabel}
                </span>
              </div>
            </div>
          </div>
        </div>

        <button
          aria-label={isLoggingOut ? 'Выходим...' : 'Выйти'}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.7rem] text-slate-600 transition hover:bg-slate-100/70 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:text-slate-300"
          disabled={isLoggingOut}
          onClick={() => {
            void handleLogout()
          }}
          title="Выйти"
          type="button"
        >
          <LogOutIcon
            className={isLoggingOut ? 'h-5 w-5 animate-pulse' : 'h-5 w-5'}
          />
        </button>
      </div>

      {logoutError ? (
        <div className="mt-2 sm:mt-3">
          <InlineAlert message={logoutError} tone="error" />
        </div>
      ) : null}
    </header>
  )
}
