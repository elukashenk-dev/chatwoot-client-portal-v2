import { Link } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { AuthShell } from '../../../shared/ui/AuthShell'
import { LoginForm } from '../components/LoginForm'

export function LoginPage() {
  return (
    <AuthShell
      description="Войдите, чтобы продолжить работу с сообщениями и обращениями."
      title="Клиентский портал"
    >
      <LoginForm />

      <div className="mt-5 flex items-center justify-between gap-4 text-sm sm:text-[15px]">
        <Link
          className="inline-flex min-h-11 items-center rounded-[0.75rem] text-brand-800 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
          to={routePaths.auth.passwordResetRequest}
        >
          Забыли пароль?
        </Link>

        <Link
          className="inline-flex min-h-11 items-center rounded-[0.75rem] text-slate-700 transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
          to={routePaths.auth.register}
        >
          Новый аккаунт
        </Link>
      </div>

      <div className="mt-6 rounded-[0.9rem] border border-slate-200/80 bg-slate-50/90 px-4 py-3 text-sm leading-6 text-slate-600">
        Если у вас еще нет доступа, запросите его по email, который уже известен
        вашей компании.
      </div>
    </AuthShell>
  )
}
