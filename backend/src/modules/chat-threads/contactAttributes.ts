import { ApiError } from '../../lib/errors.js'

export const PORTAL_GROUP_CONTACT_IDS_MAX = 20

type PortalContactType = 'group' | 'person'

type PortalContactAttributes = {
  groupContactIds: number[]
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

function readPortalIsGroup(value: unknown) {
  if (value === undefined || value === null || value === false) {
    return false
  }

  if (value === true) {
    return true
  }

  throw createContactConfigurationError('portal_is_group_invalid')
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
      'portal_client_group_contact_ids_invalid',
    )
  }

  const parsedValue = Number(value)

  if (!Number.isSafeInteger(parsedValue)) {
    throw createContactConfigurationError(
      'portal_client_group_contact_ids_invalid',
    )
  }

  return parsedValue
}

export function parsePortalGroupContactIdsAttribute(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return []
  }

  if (typeof value !== 'string') {
    throw createContactConfigurationError(
      'portal_client_group_contact_ids_invalid',
    )
  }

  if (!value.trim()) {
    return []
  }

  const tokens = value.split(',').map((token) => token.trim())

  if (
    tokens.length > PORTAL_GROUP_CONTACT_IDS_MAX ||
    tokens.some((token) => !token)
  ) {
    throw createContactConfigurationError(
      'portal_client_group_contact_ids_invalid',
    )
  }

  const groupContactIds: number[] = []
  const seenContactIds = new Set<number>()

  for (const token of tokens) {
    const groupContactId = assertPositiveSafeIntegerToken(token)

    if (seenContactIds.has(groupContactId)) {
      continue
    }

    seenContactIds.add(groupContactId)
    groupContactIds.push(groupContactId)
  }

  return groupContactIds
}

export function parsePortalContactAttributes(
  customAttributes: Record<string, unknown> | null | undefined,
): PortalContactAttributes {
  const attributes = customAttributes ?? {}

  return {
    groupContactIds: parsePortalGroupContactIdsAttribute(
      attributes.portal_client_group_contact_ids,
    ),
    enabled: readPortalEnabled(attributes.portal_enabled),
    type: readPortalIsGroup(attributes.portal_is_group) ? 'group' : 'person',
  }
}

export function assertPortalPersonContactEnabled(
  contact: PortalContactWithAttributes,
) {
  const attributes = parsePortalContactAttributes(contact.customAttributes)

  if (attributes.type !== 'person') {
    throw createContactConfigurationError('portal_person_contact_expected')
  }

  if (!attributes.enabled) {
    throw createContactConfigurationError('portal_contact_disabled')
  }

  return attributes
}

export function assertPortalGroupContactEnabled(
  contact: PortalContactWithAttributes,
) {
  const attributes = parsePortalContactAttributes(contact.customAttributes)

  if (attributes.type !== 'group') {
    throw createContactConfigurationError('portal_group_flag_required')
  }

  if (!attributes.enabled) {
    throw createContactConfigurationError('portal_group_contact_disabled')
  }

  return attributes
}
