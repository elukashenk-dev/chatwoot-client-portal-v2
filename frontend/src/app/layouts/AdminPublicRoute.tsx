import { Navigate, Outlet } from 'react-router-dom'

import { routePaths } from '../routePaths'
import { useAdminSession } from '../../features/admin-auth/lib/adminSessionContext'
import { InlineAlert } from '../../shared/ui/InlineAlert'
import { PrimaryButton } from '../../shared/ui/PrimaryButton'
import { AuthStartupCanvas } from './AuthStartupSurface'

export function AdminPublicRoute() {
  const { errorMessage, refreshSession, status } = useAdminSession()

  if (status === 'checking') {
    return <AuthStartupCanvas fillViewport />
  }

  if (status === 'error') {
    return (
      <section className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center space-y-4 px-6 py-10">
        <h1 className="text-2xl font-semibold text-slate-950">
          Сессию администратора не удалось проверить
        </h1>
        <p className="text-sm leading-6 text-slate-600">
          Проверьте подключение и повторите попытку.
        </p>
        <InlineAlert message={errorMessage} tone="error" />
        <PrimaryButton
          onClick={() => {
            void refreshSession()
          }}
          type="button"
        >
          Повторить
        </PrimaryButton>
      </section>
    )
  }

  return status === 'authenticated' ? (
    <Navigate replace to={routePaths.admin.branding} />
  ) : (
    <Outlet />
  )
}
