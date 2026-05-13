import { Link } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
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
        <Link
          className="rounded-[0.4rem] font-normal text-brand-700 underline-offset-4 transition hover:text-brand-800 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
          to={routePaths.auth.login}
        >
          Вернуться ко входу
        </Link>
      </div>
    </TenantAuthShell>
  )
}
