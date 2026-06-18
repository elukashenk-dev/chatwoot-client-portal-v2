import { Link } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { TenantAuthShell } from '../../tenant/components/TenantAuthShell'
import {
  AuthFlowActions,
  authFlowActionLinkClassName,
} from '../components/AuthFlowActions'
import { RegisterRequestForm } from '../components/RegisterRequestForm'

export function RegisterRequestPage() {
  return (
    <TenantAuthShell
      description="Укажите имя и рабочий email, чтобы получить код подтверждения."
      title="Создать аккаунт"
    >
      <RegisterRequestForm />

      <AuthFlowActions>
        Уже есть аккаунт?{' '}
        <Link className={authFlowActionLinkClassName} to={routePaths.auth.login}>
          Войти
        </Link>
      </AuthFlowActions>
    </TenantAuthShell>
  )
}
