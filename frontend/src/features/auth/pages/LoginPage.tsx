import { Link } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import mainHeaderUrl from '../../../assets/chat/main-header.png'
import { AuthShell } from '../../../shared/ui/AuthShell'
import { BrandMark } from '../../../shared/ui/BrandMark'
import { LoginForm } from '../components/LoginForm'

function LoginHeader() {
  return (
    <div className="relative mx-[-1.5rem] -mt-4 mb-8 aspect-[700/512] overflow-hidden sm:mx-[-2.5rem]">
      <img
        alt=""
        className="h-full w-full object-cover object-center"
        src={mainHeaderUrl}
      />

      <div className="absolute left-10 top-12">
        <BrandMark align="start" showDivider={false} size="hero" />
      </div>
    </div>
  )
}

export function LoginPage() {
  return (
    <AuthShell
      brand={null}
      description="Войдите, чтобы продолжить работу с сообщениями и обращениями."
      hero={<LoginHeader />}
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
