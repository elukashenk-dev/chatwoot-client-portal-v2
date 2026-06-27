import { TenantAuthShell } from '../../tenant/components/TenantAuthShell'
import { AuthLegalNotice } from '../components/AuthLegalNotice'
import { AuthSecondaryLinks } from '../components/AuthSecondaryLinks'
import { AuthSupportBlock } from '../components/AuthSupportBlock'
import { LoginForm } from '../components/LoginForm'

export function PasswordLoginPage() {
  return (
    <TenantAuthShell
      description="Введите email и пароль, если вы уже настроили пароль."
      descriptionClassName="auth-subtitle--login"
      title="Вход по паролю"
    >
      <LoginForm legalNotice={<AuthLegalNotice />} />
      <AuthSecondaryLinks variant="password-login" />
      <AuthSupportBlock />
    </TenantAuthShell>
  )
}
