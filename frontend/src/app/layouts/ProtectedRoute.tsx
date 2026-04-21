import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { routePaths } from '../routePaths'
import { useAuthSession } from '../../features/auth/lib/authSessionContext'
import { InlineAlert } from '../../shared/ui/InlineAlert'
import { PrimaryButton } from '../../shared/ui/PrimaryButton'
import { PortalFrame } from '../../shared/ui/PortalFrame'
import { RefreshIcon } from '../../shared/ui/icons'

function ProtectedSessionCheck() {
  return (
    <PortalFrame>
      <section className="mx-auto w-full max-w-md space-y-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[0.8rem] bg-brand-50 text-brand-800">
          <RefreshIcon className="h-5 w-5 animate-spin" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            Проверяем сессию
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Открываем защищенную клиентскую зону.
          </p>
        </div>
      </section>
    </PortalFrame>
  )
}

function ProtectedSessionError({
  errorMessage,
  onRetry,
}: {
  errorMessage: string | null
  onRetry: () => void
}) {
  return (
    <PortalFrame>
      <section className="mx-auto w-full max-w-md space-y-5">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[0.8rem] bg-amber-50 text-amber-800">
            <RefreshIcon className="h-5 w-5" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">
            Сессию не удалось проверить
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Проверьте подключение и повторите попытку.
          </p>
        </div>

        <InlineAlert message={errorMessage} tone="error" />

        <PrimaryButton onClick={onRetry} type="button">
          Повторить
        </PrimaryButton>
      </section>
    </PortalFrame>
  )
}

export function ProtectedRoute() {
  const location = useLocation()
  const { errorMessage, refreshSession, status, user } = useAuthSession()

  if (status === 'checking') {
    return <ProtectedSessionCheck />
  }

  if (status === 'error') {
    return (
      <ProtectedSessionError
        errorMessage={errorMessage}
        onRetry={() => {
          void refreshSession()
        }}
      />
    )
  }

  if (status !== 'authenticated' || !user) {
    return (
      <Navigate
        replace
        state={{ from: location }}
        to={routePaths.auth.login}
      />
    )
  }

  return <Outlet />
}
