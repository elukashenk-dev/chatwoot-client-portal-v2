import { Link } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { authPrimaryLinkClassName } from '../../../shared/ui/inputStyles'
import { TenantAuthShell } from '../../tenant/components/TenantAuthShell'
import { RegisterRequestForm } from '../components/RegisterRequestForm'

export function RegisterRequestPage() {
  return (
    <TenantAuthShell
      description="Укажите имя и рабочий email, чтобы получить код подтверждения."
      title="Создать аккаунт"
    >
      <RegisterRequestForm />

      <div className="mt-4 text-center text-sm text-slate-500 sm:text-[15px]">
        Уже есть аккаунт?{' '}
        <Link className={authPrimaryLinkClassName} to={routePaths.auth.login}>
          Войти
        </Link>
      </div>
    </TenantAuthShell>
  )
}
