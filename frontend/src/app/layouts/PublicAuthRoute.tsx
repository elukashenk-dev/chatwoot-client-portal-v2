import { Navigate, useLocation } from 'react-router-dom'

import { useAuthSession } from '../../features/auth/lib/authSessionContext'
import { getPostLoginPath } from '../../features/auth/lib/postLoginRedirect'
import { AppStartupScreen } from '../../features/tenant/components/AppStartupScreen'
import { AuthLayout } from './AuthLayout'

function AuthSessionCheck() {
  return (
    <AppStartupScreen
      description="Проверяем доступ и готовим нужный экран."
      mode="screen"
      statusLabel="Проверяем сессию"
      title="Открываем кабинет"
    />
  )
}

export function PublicAuthRoute() {
  const location = useLocation()
  const { status } = useAuthSession()

  if (status === 'authenticated') {
    return <Navigate replace to={getPostLoginPath(location.state)} />
  }

  if (status === 'checking') {
    return <AuthSessionCheck />
  }

  return <AuthLayout />
}
