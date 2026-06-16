import headsetIconUrl from '../../../../assets/auth/headset.svg'
import { LockIcon, MailIcon, PhoneFilledIcon } from '../../../../shared/ui/icons'
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
        descriptionClassName="auth-subtitle--login"
        title={branding.copy.authTitle}
      >
        <form aria-label="Форма входа предпросмотра" className="auth-login-form">
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

          <p className="auth-legal-text">
            Используя сервис, вы принимаете{' '}
            <span className="auth-legal-preview-link">
              Пользовательское соглашение
            </span>{' '}
            и подтверждаете ознакомление с{' '}
            <span className="auth-legal-preview-link">
              Политикой обработки персональных данных
            </span>
            .
          </p>

          <button
            className="auth-login-submit w-full bg-brand-900 text-white disabled:opacity-100"
            disabled
            type="button"
          >
            Войти
          </button>
        </form>

        <div className="auth-secondary-links">
          <span>Забыли пароль?</span>
          <span aria-hidden="true" className="auth-secondary-links__separator" />
          <span className="text-right">Создать аккаунт</span>
        </div>

        <div className="auth-support-block">
          <div aria-hidden="true" className="auth-support-divider">
            <span />
            <img alt="" className="auth-support-icon" src={headsetIconUrl} />
            <span />
          </div>

          <p>Нет доступа к чату?</p>

          <span className="auth-support-phone">
            <PhoneFilledIcon className="auth-support-phone-icon" />
            +7 (800) 000-00-00
          </span>
        </div>
      </TenantAuthShell>
    </div>
  )
}
