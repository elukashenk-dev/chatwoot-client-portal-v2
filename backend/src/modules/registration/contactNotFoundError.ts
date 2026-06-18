import { ApiError } from '../../lib/errors.js'

export type RegistrationSupportContactReader = {
  getPublicBranding(): Promise<{
    branding: {
      supportContact: {
        phoneDisplay: string | null
      }
    }
  }>
}

export async function createContactNotFoundError(
  supportContactReader: RegistrationSupportContactReader,
) {
  const response = await supportContactReader.getPublicBranding()
  const phone = response.branding.supportContact.phoneDisplay

  return new ApiError(
    403,
    'REGISTRATION_CONTACT_NOT_FOUND',
    phone
      ? `Мы не нашли профиль с таким email. Позвоните по тел: ${phone}.`
      : 'Мы не нашли профиль с таким email. Обратитесь в поддержку.',
  )
}
