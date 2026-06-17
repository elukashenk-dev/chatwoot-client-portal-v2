import { TenantAuthShell } from '../../tenant/components/TenantAuthShell'
import { PasswordResetVerifyForm } from '../components/PasswordResetVerifyForm'
import { getStoredPasswordResetRequest } from '../lib/passwordResetFlow'

export function PasswordResetVerifyPage() {
  const passwordResetRequest = getStoredPasswordResetRequest()

  return (
    <TenantAuthShell
      description={
        <>
          <span className="block">
            Если доступ активен, код восстановления отправлен на
          </span>
          <span className="mt-1.5 block font-medium text-slate-700">
            {passwordResetRequest?.email ?? 'ваш email'}
          </span>
        </>
      }
      title="Подтверждение почты"
    >
      <PasswordResetVerifyForm />
    </TenantAuthShell>
  )
}
