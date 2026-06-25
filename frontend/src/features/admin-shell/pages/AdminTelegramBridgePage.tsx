import { useState } from 'react'

import { AdminTelegramBridgeForm } from '../../admin-telegram-bridge/components/AdminTelegramBridgeForm'
import { useAdminSession } from '../../admin-auth/lib/adminSessionContext'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import { LogOutIcon } from '../../../shared/ui/icons'

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Не удалось выйти.'
}

export function AdminTelegramBridgePage() {
  const { admin, signOut } = useAdminSession()
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)

  async function handleLogout() {
    setLogoutError(null)
    setIsSigningOut(true)

    try {
      await signOut()
    } catch (error) {
      setLogoutError(getErrorMessage(error))
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <main className="min-h-full bg-slate-100 text-slate-950">
      <section className="lg:hidden flex min-h-full flex-col justify-center px-6 py-16 text-center">
        <div className="mx-auto max-w-sm space-y-4">
          <p className="text-xs font-semibold uppercase tracking-normal text-brand-700">
            Админ-консоль
          </p>
          <h1 className="text-2xl font-semibold">
            Админ-консоль доступна с широкого экрана
          </h1>
        </div>
      </section>

      <section
        aria-label="Макет админки Telegram bridge"
        className="hidden h-screen min-h-0 overflow-hidden bg-slate-100 lg:grid"
        style={{
          gridTemplateColumns: '15rem minmax(0,1fr)',
          isolation: 'isolate',
        }}
      >
        <aside
          aria-label="Админ-консоль"
          className="sticky top-0 h-screen overflow-y-auto border-r border-slate-200 bg-white px-5 py-6"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-brand-700">
              Админ-консоль
            </p>
            <p className="mt-2 text-2xl font-semibold">Интеграции</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {admin?.email ?? 'Администратор портала'}
            </p>
          </div>

          <nav aria-label="Разделы админки" className="mt-8 space-y-2">
            <a
              className="block rounded-[0.6rem] bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-950"
              href="#telegram-bridge"
            >
              Telegram bridge
            </a>
          </nav>

          <div className="mt-8 space-y-3">
            <InlineAlert message={logoutError} tone="error" />
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-[0.6rem] border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              disabled={isSigningOut}
              onClick={() => {
                void handleLogout()
              }}
              type="button"
            >
              <LogOutIcon className="h-4 w-4" />
              Выйти
            </button>
          </div>
        </aside>

        <section className="min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-6 py-6">
          <div className="mx-auto max-w-3xl" id="telegram-bridge">
            <div className="mb-5">
              <h1 className="mt-1 text-3xl font-semibold tracking-normal">
                Telegram bridge
              </h1>
            </div>

            <AdminTelegramBridgeForm />
          </div>
        </section>
      </section>
    </main>
  )
}
