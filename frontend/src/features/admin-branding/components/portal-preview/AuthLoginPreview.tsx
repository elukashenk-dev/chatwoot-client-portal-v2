import { LockIcon, MailIcon } from '../../../../shared/ui/icons'
import {
  authFieldIconClassName,
  inputClassName,
} from '../../../../shared/ui/inputStyles'
import { AuthSecondaryLinks } from '../../../auth/components/AuthSecondaryLinks'
import { AuthSupportBlock } from '../../../auth/components/AuthSupportBlock'
import { useBranding } from '../../../branding/lib/useBranding'
import { TenantAuthShell } from '../../../tenant/components/TenantAuthShell'

export function AuthLoginPreview() {
  const { branding } = useBranding()

  return (
    <div className="portal-preview-auth-fit portal-preview-no-scrollbar">
      <div className="portal-preview-auth-fit__canvas">
        <TenantAuthShell
          description={branding.copy.authSubtitle}
          descriptionClassName="auth-subtitle--login"
          title={branding.copy.authTitle}
        >
          <form
            aria-label="Форма входа предпросмотра"
            className="auth-login-form"
          >
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
              aria-disabled="true"
              className="auth-login-submit w-full bg-brand-900 text-white"
              tabIndex={-1}
              type="button"
            >
              Войти
            </button>
          </form>

          <AuthSecondaryLinks preview />
          <AuthSupportBlock preview />
        </TenantAuthShell>
      </div>
    </div>
  )
}
