import { LockIcon, MailIcon, PhoneIcon } from '../../../../shared/ui/icons'
import {
  authFieldIconClassName,
  inputClassName,
} from '../../../../shared/ui/inputStyles'
import { useBranding } from '../../../branding/lib/useBranding'
import { TenantAuthShell } from '../../../tenant/components/TenantAuthShell'

export function AuthLoginPreview() {
  const { branding } = useBranding()

  return (
    <div className="portal-preview-no-scrollbar h-full overflow-y-auto">
      <TenantAuthShell
        description={branding.copy.authSubtitle}
        title={branding.copy.authTitle}
      >
        <form aria-label="Форма входа предпросмотра" className="space-y-3">
          <label className="relative block">
            <span className="auth-muted-text pointer-events-none absolute left-5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center">
              <MailIcon className={authFieldIconClassName} />
            </span>
            <input
              aria-label="Email"
              className={`${inputClassName(false, false)} pl-16`}
              disabled
              placeholder="name@company.ru"
              type="email"
            />
          </label>

          <label className="relative block">
            <span className="auth-muted-text pointer-events-none absolute left-5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center">
              <LockIcon className={authFieldIconClassName} />
            </span>
            <input
              aria-label="Пароль"
              className={`${inputClassName(false, false)} pl-16`}
              disabled
              placeholder="Введите пароль"
              type="password"
            />
          </label>

          <button
            className="min-h-14 w-full rounded-[0.7rem] bg-brand-900 text-[16px] font-semibold text-white shadow-sm disabled:opacity-100"
            disabled
            type="button"
          >
            Войти
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between gap-4 text-sm text-brand-700 sm:text-[15px]">
          <span>Забыли пароль?</span>
          <span className="text-right">Создать аккаунт</span>
        </div>

        <div className="mt-auto pt-6">
          <aside className="auth-support-card auth-muted-text flex items-center gap-3 rounded-[0.6rem] px-3.5 py-3 text-[13px] leading-5 shadow-sm">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200/80 text-brand-800 max-[360px]:hidden">
              <PhoneIcon className="h-4 w-4" />
            </span>

            <div className="min-w-0">
              <p className="auth-text text-[14px] font-medium">
                Нет доступа к чату?
              </p>
              <p className="whitespace-nowrap">Поддержка: +7 (906) 12-955-12</p>
            </div>
          </aside>
        </div>
      </TenantAuthShell>
    </div>
  )
}
