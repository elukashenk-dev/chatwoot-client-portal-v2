import { LockIcon, MailIcon, PhoneIcon } from '../../../../shared/ui/icons'
import { useBranding } from '../../../branding/lib/useBranding'
import { TenantAuthShell } from '../../../tenant/components/TenantAuthShell'

export function AuthLoginPreview() {
  const { branding } = useBranding()

  return (
    <div className="h-full overflow-y-auto">
      <TenantAuthShell
        description={branding.copy.authSubtitle}
        title={branding.copy.authTitle}
      >
        <form aria-label="Форма входа предпросмотра" className="space-y-3">
          <label className="flex min-h-14 items-center gap-3 rounded-[0.6rem] border border-slate-200 bg-white px-4 text-slate-500">
            <MailIcon className="h-5 w-5 shrink-0 text-slate-500" />
            <input
              aria-label="Email"
              className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-slate-400"
              disabled
              placeholder="name@company.ru"
              type="email"
            />
          </label>

          <label className="flex min-h-14 items-center gap-3 rounded-[0.6rem] border border-slate-200 bg-white px-4 text-slate-500">
            <LockIcon className="h-5 w-5 shrink-0 text-slate-500" />
            <input
              aria-label="Пароль"
              className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-slate-400"
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
          <aside className="flex items-center gap-3 rounded-[0.6rem] bg-slate-100/80 px-3.5 py-3 text-[13px] leading-5 shadow-sm">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200/80 text-brand-800 max-[360px]:hidden">
              <PhoneIcon className="h-4 w-4" />
            </span>

            <div className="min-w-0">
              <p className="text-[14px] font-medium text-slate-800">
                Нет доступа к чату?
              </p>
              <p className="whitespace-nowrap text-slate-500">
                Поддержка: +7 (906) 12-955-12
              </p>
            </div>
          </aside>
        </div>
      </TenantAuthShell>
    </div>
  )
}
