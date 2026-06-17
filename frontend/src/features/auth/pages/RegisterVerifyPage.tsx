import { TenantAuthShell } from '../../tenant/components/TenantAuthShell'
import { RegisterVerifyForm } from '../components/RegisterVerifyForm'
import { getStoredRegistrationRequest } from '../lib/registrationFlow'

export function RegisterVerifyPage() {
  const registrationRequest = getStoredRegistrationRequest()

  return (
    <TenantAuthShell
      description={
        <>
          <span className="block">Код подтверждения отправлен на</span>
          <span className="mt-1.5 block font-medium text-slate-700">
            {registrationRequest?.email ?? 'ваш email'}
          </span>
        </>
      }
      title="Подтверждение почты"
    >
      <RegisterVerifyForm />
    </TenantAuthShell>
  )
}
