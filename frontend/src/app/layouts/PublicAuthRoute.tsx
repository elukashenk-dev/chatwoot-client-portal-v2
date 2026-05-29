import { Navigate, useLocation } from 'react-router-dom'

import { useAuthSession } from '../../features/auth/lib/authSessionContext'
import { getPostLoginPath } from '../../features/auth/lib/postLoginRedirect'
import { StartupScreenGate } from '../../features/tenant/components/StartupScreenGate'
import { AuthLayout } from './AuthLayout'

export function PublicAuthRoute() {
  const location = useLocation()
  const { status } = useAuthSession()

  return (
    <StartupScreenGate
      active={status === 'checking'}
      fallback={{
        description: 'Проверяем доступ и готовим нужный экран.',
        mode: 'screen',
        statusLabel: 'Проверяем сессию',
        title: 'Открываем кабинет',
      }}
    >
      {status === 'authenticated' ? (
        <Navigate replace to={getPostLoginPath(location.state)} />
      ) : (
        <AuthLayout />
      )}
    </StartupScreenGate>
  )
}
