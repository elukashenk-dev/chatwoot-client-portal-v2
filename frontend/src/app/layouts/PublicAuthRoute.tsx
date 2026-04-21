import { Navigate, useLocation } from 'react-router-dom'

import { useAuthSession } from '../../features/auth/lib/authSessionContext'
import { getPostLoginPath } from '../../features/auth/lib/postLoginRedirect'
import { AuthShell } from '../../shared/ui/AuthShell'
import { InlineAlert } from '../../shared/ui/InlineAlert'
import { PrimaryButton } from '../../shared/ui/PrimaryButton'
import { PortalFrame } from '../../shared/ui/PortalFrame'
import { ServiceFooter } from '../../shared/ui/ServiceFooter'
import { AuthLayout } from './AuthLayout'

function AuthSessionCheck() {
  return (
    <PortalFrame footer={<ServiceFooter />}>
      <AuthShell
        description="Проверяем, нужно ли открыть форму входа или защищенную клиентскую зону."
        title="Клиентский портал"
      >
        <div className="space-y-4">
          <InlineAlert message="Проверяем текущую сессию..." tone="info" />

          <PrimaryButton disabled loading loadingLabel="Проверка...">
            Проверка...
          </PrimaryButton>
        </div>
      </AuthShell>
    </PortalFrame>
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
