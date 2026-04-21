import { Link } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { AuthShell } from '../../../shared/ui/AuthShell'
import { RegisterRequestForm } from '../components/RegisterRequestForm'

export function RegisterRequestPage() {
  return (
    <AuthShell
      description="Укажите имя и email. Мы проверим доступ и отправим код подтверждения."
      title="Новый аккаунт"
    >
      <RegisterRequestForm />

      <div className="mt-5 flex items-center justify-between gap-4 text-sm sm:text-[15px]">
        <Link
          className="inline-flex min-h-11 items-center rounded-[0.75rem] text-slate-700 transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
          to={routePaths.auth.login}
        >
          Вернуться ко входу
        </Link>

        <Link
          className="inline-flex min-h-11 items-center rounded-[0.75rem] text-brand-800 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
          to={routePaths.auth.login}
        >
          У меня уже есть аккаунт
        </Link>
      </div>
    </AuthShell>
  )
}
