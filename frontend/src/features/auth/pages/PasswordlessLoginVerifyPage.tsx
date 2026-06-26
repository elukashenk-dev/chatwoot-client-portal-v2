import { TenantAuthShell } from '../../tenant/components/TenantAuthShell'
import { PasswordlessLoginVerifyForm } from '../components/PasswordlessLoginVerifyForm'
import { getStoredPasswordlessLoginRequest } from '../lib/passwordlessLoginFlow'

export function PasswordlessLoginVerifyPage() {
  const loginRequest = getStoredPasswordlessLoginRequest()

  return (
    <TenantAuthShell
      description={
        <>
          <span className="block">Код входа отправлен на</span>
          <span className="mt-1.5 block font-medium text-slate-700">
            {loginRequest?.email ?? 'ваш email'}
          </span>
        </>
      }
      title="Код из почты"
    >
      <PasswordlessLoginVerifyForm />
    </TenantAuthShell>
  )
}
