export type SupportContact = {
  phoneDisplay: string | null
  phoneHref: string | null
}

function normalizeSupportPhoneDigits(phoneDisplay: string) {
  const trimmed = phoneDisplay.trim()
  const digits = trimmed.replace(/\D/gu, '')

  return trimmed.startsWith('+') ? `+${digits}` : digits
}

export function createSupportContact(
  phoneDisplay: string | null | undefined,
): SupportContact {
  if (!phoneDisplay) {
    return {
      phoneDisplay: null,
      phoneHref: null,
    }
  }

  const display = phoneDisplay.trim()
  const normalized = normalizeSupportPhoneDigits(display)

  if (!/^\+\d{7,15}$/u.test(normalized)) {
    return {
      phoneDisplay: null,
      phoneHref: null,
    }
  }

  return {
    phoneDisplay: display,
    phoneHref: `tel:${normalized}`,
  }
}

export function isValidSupportPhoneDisplay(value: string) {
  return value.trim() === '' || createSupportContact(value).phoneHref !== null
}
