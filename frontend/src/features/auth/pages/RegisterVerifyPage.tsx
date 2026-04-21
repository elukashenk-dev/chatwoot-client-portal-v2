import { AuthShell } from '../../../shared/ui/AuthShell'
import { RegisterVerifyForm } from '../components/RegisterVerifyForm'
import { getStoredRegistrationRequest } from '../lib/registrationFlow'

export function RegisterVerifyPage() {
  const registrationRequest = getStoredRegistrationRequest()

  return (
    <AuthShell
      description={
        <>
          <span className="block">Мы отправили 6-значный код на</span>
          <span className="mt-1.5 block font-medium text-slate-700">
            {registrationRequest?.email ?? 'ваш email'}
          </span>
        </>
      }
      title="Подтверждение Email"
    >
      <RegisterVerifyForm />
    </AuthShell>
  )
}
