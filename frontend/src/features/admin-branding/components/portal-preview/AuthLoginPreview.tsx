import { MailIcon } from '../../../../shared/ui/icons'
import {
  authFieldIconClassName,
  inputClassName,
} from '../../../../shared/ui/inputStyles'
import { AuthLegalNotice } from '../../../auth/components/AuthLegalNotice'
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
              <span className="auth-muted-text auth-field-icon pointer-events-none absolute left-5 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center">
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

            <button
              aria-disabled="true"
              className="auth-login-submit w-full bg-brand-900 text-white"
              tabIndex={-1}
              type="button"
            >
              Получить код
            </button>
          </form>

          <AuthSecondaryLinks
            className="auth-secondary-links--after-submit"
            preview
          />
          <AuthLegalNotice preview />
          <AuthSupportBlock preview />
        </TenantAuthShell>
      </div>
    </div>
  )
}
