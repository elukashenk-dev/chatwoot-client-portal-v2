import { Link } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { TenantAuthShell } from '../../tenant/components/TenantAuthShell'
import { AuthCompactSupport } from '../components/AuthCompactSupport'
import {
  AuthFlowActions,
  authFlowActionLinkClassName,
} from '../components/AuthFlowActions'
import { PasswordResetRequestForm } from '../components/PasswordResetRequestForm'

export function PasswordResetRequestPage() {
  return (
    <TenantAuthShell
      description="Введите email. Если доступ активен, мы отправим код восстановления."
      title="Восстановить пароль"
    >
      <PasswordResetRequestForm />

      <AuthFlowActions>
        <Link className={authFlowActionLinkClassName} to={routePaths.auth.login}>
          Вернуться ко входу
        </Link>
      </AuthFlowActions>
      <AuthCompactSupport />
    </TenantAuthShell>
  )
}
