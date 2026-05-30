import { Navigate, useLocation } from 'react-router-dom'

import { useAuthSession } from '../../features/auth/lib/authSessionContext'
import { getPostLoginPath } from '../../features/auth/lib/postLoginRedirect'
import { useStartupSurfaceReport } from '../../features/tenant/startup/startupSurfaceContext'
import { AuthLayout } from './AuthLayout'

export function PublicAuthRoute() {
  const location = useLocation()
  const { status } = useAuthSession()

  useStartupSurfaceReport({
    active: status === 'checking',
    description: 'Проверяем доступ и готовим нужный экран.',
    phase: 'session',
    statusLabel: 'Проверяем сессию',
    title: 'Открываем кабинет',
  })

  if (status === 'checking') {
    return null
  }

  return status === 'authenticated' ? (
    <Navigate replace to={getPostLoginPath(location.state)} />
  ) : (
    <AuthLayout />
  )
}
