import { ApiError } from '../../lib/errors.js'

export const PORTAL_COMPANY_CONTACT_IDS_MAX = 20

type PortalContactType = 'company' | 'person'

type PortalContactAttributes = {
  companyContactIds: number[]
  enabled: boolean
  type: PortalContactType
}

type PortalContactWithAttributes = {
  customAttributes?: Record<string, unknown> | null
  id: number
}

const CONFIGURATION_ERROR_MESSAGE =
  'Доступ к порталу настроен некорректно. Обратитесь в поддержку.'

function createContactConfigurationError(code: string) {
  return new ApiError(403, code, CONFIGURATION_ERROR_MESSAGE)
}

function readPortalContactType(value: unknown): PortalContactType {
  if (value === 'person' || value === 'company') {
    return value
  }

  throw createContactConfigurationError('portal_contact_type_invalid')
}

function readPortalEnabled(value: unknown) {
  if (typeof value === 'boolean') {
    return value
  }

  throw createContactConfigurationError('portal_contact_disabled')
}

function assertPositiveSafeIntegerToken(value: string) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw createContactConfigurationError(
      'portal_client_company_contact_ids_invalid',
    )
  }

  const parsedValue = Number(value)

  if (!Number.isSafeInteger(parsedValue)) {
    throw createContactConfigurationError(
      'portal_client_company_contact_ids_invalid',
    )
  }

  return parsedValue
}

export function parsePortalCompanyContactIdsAttribute(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return []
  }

  if (typeof value !== 'string') {
    throw createContactConfigurationError(
      'portal_client_company_contact_ids_invalid',
    )
  }

  if (!value.trim()) {
    return []
  }

  const tokens = value.split(',').map((token) => token.trim())

  if (
    tokens.length > PORTAL_COMPANY_CONTACT_IDS_MAX ||
    tokens.some((token) => !token)
  ) {
    throw createContactConfigurationError(
      'portal_client_company_contact_ids_invalid',
    )
  }

  const companyContactIds: number[] = []
  const seenContactIds = new Set<number>()

  for (const token of tokens) {
    const companyContactId = assertPositiveSafeIntegerToken(token)

    if (seenContactIds.has(companyContactId)) {
      continue
    }

    seenContactIds.add(companyContactId)
    companyContactIds.push(companyContactId)
  }

  return companyContactIds
}

export function parsePortalContactAttributes(
  customAttributes: Record<string, unknown> | null | undefined,
): PortalContactAttributes {
  const attributes = customAttributes ?? {}

  return {
    companyContactIds: parsePortalCompanyContactIdsAttribute(
      attributes.portal_client_company_contact_ids,
    ),
    enabled: readPortalEnabled(attributes.portal_enabled),
    type: readPortalContactType(attributes.portal_contact_type),
  }
}

export function assertPortalPersonContactEnabled(
  contact: PortalContactWithAttributes,
) {
  const attributes = parsePortalContactAttributes(contact.customAttributes)

  if (attributes.type !== 'person') {
    throw createContactConfigurationError('portal_contact_type_invalid')
  }

  if (!attributes.enabled) {
    throw createContactConfigurationError('portal_contact_disabled')
  }

  return attributes
}

export function assertPortalCompanyContactEnabled(
  contact: PortalContactWithAttributes,
) {
  const attributes = parsePortalContactAttributes(contact.customAttributes)

  if (attributes.type !== 'company') {
    throw createContactConfigurationError('portal_company_contact_type_invalid')
  }

  if (!attributes.enabled) {
    throw createContactConfigurationError('portal_company_contact_disabled')
  }

  return attributes
}
