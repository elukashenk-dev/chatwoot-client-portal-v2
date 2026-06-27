export const CUSTOMER_EMAIL_PROOF_TTL_SECONDS = 15 * 60

export function createCustomerEmailProofExpiresAt(provedAt: Date) {
  return new Date(provedAt.getTime() + CUSTOMER_EMAIL_PROOF_TTL_SECONDS * 1000)
}

export function isCustomerEmailProofFresh({
  emailProofExpiresAt,
  now,
}: {
  emailProofExpiresAt: Date | null | undefined
  now: Date
}) {
  return Boolean(
    emailProofExpiresAt && emailProofExpiresAt.getTime() > now.getTime(),
  )
}
