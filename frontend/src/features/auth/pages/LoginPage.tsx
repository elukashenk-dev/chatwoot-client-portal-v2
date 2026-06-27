import { useBranding } from '../../branding/lib/useBranding'
import { TenantAuthShell } from '../../tenant/components/TenantAuthShell'
import { AuthLegalNotice } from '../components/AuthLegalNotice'
import { AuthSecondaryLinks } from '../components/AuthSecondaryLinks'
import { AuthSupportBlock } from '../components/AuthSupportBlock'
import { PasswordlessLoginRequestForm } from '../components/PasswordlessLoginRequestForm'

export function LoginPage() {
  const { branding } = useBranding()

  return (
    <TenantAuthShell
      description={branding.copy.authSubtitle}
      descriptionClassName="auth-subtitle--login"
      title={branding.copy.authTitle}
    >
      <PasswordlessLoginRequestForm />
      <AuthLegalNotice />
      <AuthSecondaryLinks />
      <AuthSupportBlock />
    </TenantAuthShell>
  )
}
