import { Navigate, useLocation } from 'react-router-dom'

import { useAuthSession } from '../../features/auth/lib/authSessionContext'
import { getPostLoginPath } from '../../features/auth/lib/postLoginRedirect'
import { AuthLayout } from './AuthLayout'

export function PublicAuthRoute() {
  const location = useLocation()
  const { status } = useAuthSession()

  if (status === 'checking') {
    return null
  }

  return status === 'authenticated' ? (
    <Navigate replace to={getPostLoginPath(location.state)} />
  ) : (
    <AuthLayout />
  )
}
