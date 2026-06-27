import { TenantAuthShell } from '../../tenant/components/TenantAuthShell'
import { LegalConsentForm } from '../components/LegalConsentForm'
import { getStoredPasswordlessLoginLegalContinuation } from '../lib/passwordlessLoginFlow'

export function LegalConsentPage() {
  const legalContinuation = getStoredPasswordlessLoginLegalContinuation()

  return (
    <TenantAuthShell
      description={
        <>
          <span className="block">Email подтвержден для</span>
          <span className="mt-1.5 block font-medium text-slate-700">
            {legalContinuation?.email ?? 'вашего email'}
          </span>
        </>
      }
      title="Принять условия"
    >
      <LegalConsentForm />
    </TenantAuthShell>
  )
}
