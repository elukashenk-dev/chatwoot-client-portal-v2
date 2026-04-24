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

function translateConversationStatus(status: string | null | undefined) {
  if (!status) {
    return 'Защищенная сессия'
  }

  const normalizedStatus = status.toLowerCase()

  if (normalizedStatus === 'open') {
    return 'В работе'
  }

  if (normalizedStatus === 'resolved') {
    return 'Завершено'
  }

  if (normalizedStatus === 'pending') {
    return 'Ожидает ответа'
  }

  return status
}

export function ChatHeader({ conversation, isReady }: ChatHeaderProps) {
  const navigate = useNavigate()
  const { signOut, user } = useAuthSession()
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

  const statusLabel = isReady
    ? translateConversationStatus(conversation?.status)
    : 'Защищенная сессия'

  return (
    <header className="app-safe-top relative z-10 border-b border-brand-900/20 bg-brand-800 px-4 pb-2 text-white shadow-sm [background-image:radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.10),transparent_48%)] sm:px-6 sm:pb-4">
      <div className="flex items-center justify-between gap-3 sm:items-start sm:gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <button
            aria-label="Меню"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.7rem] text-white/90 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/20 disabled:cursor-default sm:h-11 sm:w-11"
            disabled
            title="Меню"
            type="button"
          >
            <MenuIcon className="h-6 w-6" />
          </button>

          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1rem] border border-white/30 bg-brand-900/35 text-[24px] font-semibold tracking-wide text-white shadow-sm shadow-brand-950/20 ring-1 ring-white/10 sm:h-16 sm:w-16 sm:rounded-[1.15rem] sm:text-[28px]">
            PG
          </div>

          <div className="min-w-0">
            <h1 className="truncate text-[16px] font-semibold text-white sm:text-[17px]">
              Клиентский чат
            </h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-white/75 sm:mt-1 sm:gap-x-3 sm:text-[13px]">
              <span className="truncate">
                Агент: {conversation?.assigneeName ?? 'Команда ProvGroup'}
              </span>
              <span
                aria-hidden="true"
                className="hidden text-white/70 sm:inline"
              >
                •
              </span>
              <span className="hidden truncate sm:inline">{user?.email}</span>
              <span
                aria-hidden="true"
                className="hidden text-white/70 sm:inline"
              >
                •
              </span>
              <span className="inline-flex rounded-full border border-emerald-100/20 bg-emerald-400/30 px-2 py-0.5 text-[11px] font-medium text-white">
                {statusLabel}
              </span>
            </div>
          </div>
        </div>

        <button
          aria-label={isLoggingOut ? 'Выходим...' : 'Выйти'}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.7rem] border border-slate-200 bg-white text-slate-600 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:text-slate-300 sm:h-10 sm:w-10"
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

      <div className="mt-2 sm:mt-3">
        <InlineAlert message={logoutError} tone="error" />
      </div>
    </header>
  )
}
