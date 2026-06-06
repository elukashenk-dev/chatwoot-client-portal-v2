import { Outlet } from 'react-router-dom'

import { AdminSessionProvider } from '../../features/admin-auth/lib/AdminSessionProvider'

export function AdminSessionBoundary() {
  return (
    <AdminSessionProvider>
      <Outlet />
    </AdminSessionProvider>
  )
}
