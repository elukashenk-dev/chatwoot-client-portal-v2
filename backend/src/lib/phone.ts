const phoneLikePattern = /^\s*\+?[\d\s().-]+\s*$/
const e164DigitsMinLength = 8
const e164DigitsMaxLength = 15

function stripPhoneSeparators(value: string) {
  return value.replace(/[\s().-]/g, '')
}

function isValidE164Digits(digits: string) {
  return (
    /^\d+$/.test(digits) &&
    digits.length >= e164DigitsMinLength &&
    digits.length <= e164DigitsMaxLength
  )
}

export function normalizePhoneToE164(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }

  const rawValue = String(value).trim()

  if (!rawValue || !phoneLikePattern.test(rawValue)) {
    return null
  }

  const compactValue = stripPhoneSeparators(rawValue)

  if (compactValue.startsWith('+')) {
    const digits = compactValue.slice(1)

    return isValidE164Digits(digits) ? `+${digits}` : null
  }

  const digits = compactValue

  if (digits.startsWith('8') && digits.length === 11) {
    return `+7${digits.slice(1)}`
  }

  if (digits.startsWith('7') && digits.length === 11) {
    return `+${digits}`
  }

  return null
}

export function normalizeRussianPhoneToE164(value: unknown): string | null {
  const normalizedPhone = normalizePhoneToE164(value)

  if (!normalizedPhone?.startsWith('+7') || normalizedPhone.length !== 12) {
    return null
  }

  return normalizedPhone
}

export function maskPhoneForLogs(value: unknown): string {
  const normalizedPhone = normalizePhoneToE164(value)

  if (!normalizedPhone) {
    return '[invalid-phone]'
  }

  const digits = normalizedPhone.slice(1)
  const visiblePrefix = digits.slice(0, Math.min(2, digits.length))
  const visibleSuffix = digits.slice(-3)
  const hiddenLength = Math.max(4, digits.length - visiblePrefix.length - 3)

  return `+${visiblePrefix}${'*'.repeat(hiddenLength)}${visibleSuffix}`
}
