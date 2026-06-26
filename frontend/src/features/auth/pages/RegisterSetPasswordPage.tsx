import { TenantAuthShell } from '../../tenant/components/TenantAuthShell'
import { RegisterSetPasswordForm } from '../components/RegisterSetPasswordForm'

export function RegisterSetPasswordPage() {
  return (
    <TenantAuthShell
      className="auth-page--register-set-password"
      description="Создайте пароль сейчас или перейдите к чатам без него."
      title="Завершение регистрации"
    >
      <RegisterSetPasswordForm />
    </TenantAuthShell>
  )
}
