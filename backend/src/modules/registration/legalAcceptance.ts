export type RegistrationLegalAcceptanceInput = {
  personalDataConsentAccepted: true
  requestIp: string | null
  termsAccepted: true
  userAgent: string | null
}

export type RegistrationLegalDocumentVersions = {
  privacyPolicyVersion: string
  termsVersion: string
}

export function buildLegalAcceptanceRecord({
  acceptedAt,
  email,
  legalAcceptance,
  legalVersions,
}: {
  acceptedAt: Date
  email: string
  legalAcceptance: RegistrationLegalAcceptanceInput
  legalVersions: RegistrationLegalDocumentVersions
}) {
  return {
    acceptedAt,
    email,
    personalDataConsentAccepted: legalAcceptance.personalDataConsentAccepted,
    privacyPolicyVersion: legalVersions.privacyPolicyVersion,
    purpose: 'registration' as const,
    requestIp: legalAcceptance.requestIp,
    termsAccepted: legalAcceptance.termsAccepted,
    termsVersion: legalVersions.termsVersion,
    userAgent: legalAcceptance.userAgent,
  }
}
