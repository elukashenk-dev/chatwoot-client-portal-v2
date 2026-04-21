import { useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'

import { routePaths } from '../routePaths'
import { getAuthRequestErrorMessage } from '../../features/auth/lib/authErrors'
import { useAuthSession } from '../../features/auth/lib/authSessionContext'
import { InlineAlert } from '../../shared/ui/InlineAlert'
import { LogOutIcon } from '../../shared/ui/icons'

export function AppShellLayout() {
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

  return (
    <main className="min-h-screen bg-slate-200 text-slate-900 antialiased">
      <div className="mx-auto flex min-h-screen w-full items-center justify-center sm:p-6">
        <div className="portal-shell relative flex min-h-screen w-full flex-col overflow-hidden bg-white sm:min-h-[920px] sm:max-w-[750px] sm:rounded-[28px] sm:shadow-shell lg:h-[calc(100vh-48px)] lg:max-h-[1060px]">
          <div className="portal-corner portal-corner--tl" />
          <div className="portal-corner portal-corner--tr" />
          <div className="portal-dot-grid hidden sm:block" />

          <header className="relative z-10 border-b border-slate-200/90 bg-white/95 px-5 py-4 backdrop-blur-sm sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.85rem] bg-brand-900 text-sm font-semibold tracking-wide text-white">
                  PG
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-[17px] font-semibold text-slate-900">
                    Клиентский чат
                  </h1>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-slate-500">
                    <span className="truncate">{user?.email}</span>
                    <span aria-hidden="true">•</span>
                    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      Защищенная сессия
                    </span>
                  </div>
                </div>
              </div>

              <button
                aria-label={isLoggingOut ? 'Выходим...' : 'Выйти'}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.7rem] border border-slate-200 bg-white text-slate-600 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:text-slate-300"
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

            <div className="mt-3">
              <InlineAlert message={logoutError} tone="error" />
            </div>
          </header>

          <div className="relative z-10 flex min-h-0 flex-1 flex-col bg-transparent">
            <Outlet />
          </div>
        </div>
      </div>
    </main>
  )
}
