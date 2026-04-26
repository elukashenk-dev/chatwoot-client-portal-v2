import { Outlet } from 'react-router-dom'

import { PortalFrame } from '../../shared/ui/PortalFrame'

export function AuthLayout() {
  return (
    <PortalFrame>
      <Outlet />
    </PortalFrame>
  )
}
