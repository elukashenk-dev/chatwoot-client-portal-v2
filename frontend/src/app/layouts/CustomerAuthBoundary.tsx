import { Outlet } from 'react-router-dom'

import { AuthSessionProvider } from '../../features/auth/lib/AuthSessionProvider'

export function CustomerAuthBoundary() {
  return (
    <AuthSessionProvider>
      <Outlet />
    </AuthSessionProvider>
  )
}
