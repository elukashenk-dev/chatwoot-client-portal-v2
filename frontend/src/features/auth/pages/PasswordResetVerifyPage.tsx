import { TenantAuthShell } from '../../tenant/components/TenantAuthShell'
import { PasswordResetVerifyForm } from '../components/PasswordResetVerifyForm'
import { getStoredPasswordResetRequest } from '../lib/passwordResetFlow'

export function PasswordResetVerifyPage() {
  const passwordResetRequest = getStoredPasswordResetRequest()

  return (
    <TenantAuthShell
      description={
        <>
          <span className="block">Мы отправили 6-значный код на</span>
          <span className="mt-1.5 block font-medium text-slate-700">
            {passwordResetRequest?.email ?? 'ваш email'}
          </span>
        </>
      }
      title="Подтверждение Email"
    >
      <PasswordResetVerifyForm />
    </TenantAuthShell>
  )
}
