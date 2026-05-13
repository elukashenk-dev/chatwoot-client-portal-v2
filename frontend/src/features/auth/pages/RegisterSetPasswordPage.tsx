import { TenantAuthShell } from '../../tenant/components/TenantAuthShell'
import { RegisterSetPasswordForm } from '../components/RegisterSetPasswordForm'

export function RegisterSetPasswordPage() {
  return (
    <TenantAuthShell
      description="Создайте пароль, чтобы входить в Центр поддержки."
      title="Создание пароля"
    >
      <RegisterSetPasswordForm />
    </TenantAuthShell>
  )
}
