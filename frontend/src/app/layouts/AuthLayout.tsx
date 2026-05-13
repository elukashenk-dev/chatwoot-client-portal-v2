import { Outlet } from 'react-router-dom'

import { AuthFrame } from './AuthFrame'

export function AuthLayout() {
  return (
    <AuthFrame>
      <Outlet />
    </AuthFrame>
  )
}
