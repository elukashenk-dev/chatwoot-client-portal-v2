import { Outlet } from 'react-router-dom'

import { PortalFrame } from '../../shared/ui/PortalFrame'
import { ServiceFooter } from '../../shared/ui/ServiceFooter'

export function AuthLayout() {
  return (
    <PortalFrame footer={<ServiceFooter />}>
      <Outlet />
    </PortalFrame>
  )
}
