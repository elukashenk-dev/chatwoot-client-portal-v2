import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { getAuthRequestErrorMessage } from '../../auth/lib/authErrors'
import { useAuthSession } from '../../auth/lib/authSessionContext'
import type { ChatPrimaryConversation } from '../types'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import { ChevronLeftIcon, LogOutIcon } from '../../../shared/ui/icons'

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
    <header className="app-safe-top relative z-10 border-b border-slate-200/90 bg-white/95 px-4 pb-2 backdrop-blur-sm sm:px-6 sm:pb-4">
      <div className="flex items-center justify-between gap-3 sm:items-start sm:gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            aria-label="Назад"
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-[0.7rem] border border-slate-200 bg-white text-slate-400 sm:inline-flex"
            disabled
            title="Назад"
            type="button"
          >
            <ChevronLeftIcon className="h-[18px] w-[18px]" />
          </button>

          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.75rem] bg-brand-900 text-[13px] font-semibold tracking-wide text-white sm:h-11 sm:w-11 sm:rounded-[0.85rem] sm:text-sm">
            PG
          </div>

          <div className="min-w-0">
            <h1 className="truncate text-[16px] font-semibold text-slate-900 sm:text-[17px]">
              Клиентский чат
            </h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-slate-500 sm:mt-1 sm:gap-x-3 sm:text-[13px]">
              <span className="truncate">
                Агент: {conversation?.assigneeName ?? 'Команда ProvGroup'}
              </span>
              <span aria-hidden="true" className="hidden sm:inline">
                •
              </span>
              <span className="hidden truncate sm:inline">{user?.email}</span>
              <span aria-hidden="true" className="hidden sm:inline">
                •
              </span>
              <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
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
