import { Link } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
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
        <Link
          className="rounded-[0.4rem] font-normal text-brand-700 underline-offset-4 transition hover:text-brand-800 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
          to={routePaths.auth.login}
        >
          Войти
        </Link>
      </div>
    </TenantAuthShell>
  )
}
