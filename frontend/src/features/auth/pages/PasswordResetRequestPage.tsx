import { Link } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { authPrimaryLinkClassName } from '../../../shared/ui/inputStyles'
import { TenantAuthShell } from '../../tenant/components/TenantAuthShell'
import { PasswordResetRequestForm } from '../components/PasswordResetRequestForm'

export function PasswordResetRequestPage() {
  return (
    <TenantAuthShell
      description="Введите email. Если доступ активен, мы отправим код восстановления."
      title="Восстановить пароль"
    >
      <PasswordResetRequestForm />

      <div className="mt-4 text-center text-sm text-slate-500 sm:text-[15px]">
        <Link className={authPrimaryLinkClassName} to={routePaths.auth.login}>
          Вернуться ко входу
        </Link>
      </div>
    </TenantAuthShell>
  )
}
