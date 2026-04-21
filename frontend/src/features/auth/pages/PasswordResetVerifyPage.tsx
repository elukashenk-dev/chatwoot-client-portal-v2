import { AuthShell } from '../../../shared/ui/AuthShell'
import { PasswordResetVerifyForm } from '../components/PasswordResetVerifyForm'
import { getStoredPasswordResetRequest } from '../lib/passwordResetFlow'

export function PasswordResetVerifyPage() {
  const passwordResetRequest = getStoredPasswordResetRequest()

  return (
    <AuthShell
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
    </AuthShell>
  )
}
