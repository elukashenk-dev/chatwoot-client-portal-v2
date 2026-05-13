import { Link } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { PhoneIcon } from '../../../shared/ui/icons'
import { TenantAuthShell } from '../../tenant/components/TenantAuthShell'
import { LoginForm } from '../components/LoginForm'

export function LoginPage() {
  return (
    <TenantAuthShell
      description="Войдите, чтобы продолжить общение с поддержкой."
      title="Центр поддержки"
    >
      <LoginForm />

      <div className="mt-4 flex items-center justify-between gap-4 text-sm sm:text-[15px]">
        <Link
          className="rounded-[0.4rem] text-sm font-normal text-slate-500 underline-offset-4 transition hover:text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 sm:text-[15px]"
          to={routePaths.auth.passwordResetRequest}
        >
          Забыли пароль?
        </Link>

        <Link
          className="rounded-[0.4rem] text-right text-sm font-normal text-slate-500 underline-offset-4 transition hover:text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 sm:text-[15px]"
          to={routePaths.auth.register}
        >
          Создать аккаунт
        </Link>
      </div>

      <div className="mt-auto pt-6">
        <aside className="flex items-center gap-3 rounded-[0.6rem] bg-slate-100/80 px-3.5 py-3 text-[13px] leading-5 shadow-sm">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200/80 text-brand-800 max-[360px]:hidden">
            <PhoneIcon className="h-4 w-4" />
          </span>

          <div className="min-w-0">
            <p className="text-[14px] font-medium text-slate-800">
              Нет доступа к чату?
            </p>
            <p className="whitespace-nowrap text-slate-500">
              Поддержка:{' '}
              <a
                className="rounded-[0.35rem] text-brand-800 underline-offset-4 transition hover:text-brand-900 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
                href="tel:+79061295512"
              >
                +7 (906) 12-955-12
              </a>
            </p>
          </div>
        </aside>
      </div>
    </TenantAuthShell>
  )
}
