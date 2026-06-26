import { Link } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { TenantAuthShell } from '../../tenant/components/TenantAuthShell'
import { AuthCompactSupport } from '../components/AuthCompactSupport'
import {
  AuthFlowActions,
  authFlowActionLinkClassName,
} from '../components/AuthFlowActions'
import { PasswordlessLoginRequestForm } from '../components/PasswordlessLoginRequestForm'

export function PasswordlessLoginRequestPage() {
  return (
    <TenantAuthShell
      description="Введите email уже созданного аккаунта. Если доступ активен, мы отправим код входа."
      title="Вход по коду"
    >
      <PasswordlessLoginRequestForm />

      <AuthFlowActions>
        <Link className={authFlowActionLinkClassName} to={routePaths.auth.login}>
          Вернуться ко входу
        </Link>
      </AuthFlowActions>
      <AuthCompactSupport />
    </TenantAuthShell>
  )
}
