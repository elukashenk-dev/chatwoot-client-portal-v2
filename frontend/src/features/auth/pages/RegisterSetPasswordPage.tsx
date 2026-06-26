import { TenantAuthShell } from '../../tenant/components/TenantAuthShell'
import { RegisterSetPasswordForm } from '../components/RegisterSetPasswordForm'

export function RegisterSetPasswordPage() {
  return (
    <TenantAuthShell
      description="Создайте пароль сейчас или перейдите к чатам без него."
      title="Завершение регистрации"
    >
      <RegisterSetPasswordForm />
    </TenantAuthShell>
  )
}
