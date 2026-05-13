import { TenantAuthShell } from '../../tenant/components/TenantAuthShell'
import { PasswordResetSetPasswordForm } from '../components/PasswordResetSetPasswordForm'

export function PasswordResetSetPasswordPage() {
  return (
    <TenantAuthShell
      description="Создайте новый пароль для входа в Центр поддержки."
      title="Новый пароль"
    >
      <PasswordResetSetPasswordForm />
    </TenantAuthShell>
  )
}
