import { ChatwootClientRequestError } from './errors.js'
import type { createChatwootFetch } from './request.js'
import { readChatwootJson } from './request.js'

export type ChatwootContact = {
  avatarUrl?: string | null
  customAttributes?: Record<string, unknown>
  email: string | null
  id: number
  name: string | null
  phoneNumber: string | null
}

type ChatwootContactLookupConfig = {
  accountId: number
  apiAccessToken: string
  baseUrl: string
}

type ChatwootContactLookupOptions = {
  config: ChatwootContactLookupConfig
  contactId: number
  fetchChatwoot: ReturnType<typeof createChatwootFetch>
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function readObject(value: unknown) {
  return isPlainObject(value) ? value : null
}

function resolveChatwootAssetUrl(value: string | null, baseUrl: string) {
  const trimmedValue = value?.trim()

  if (!trimmedValue) {
    return null
  }

  try {
    return new URL(trimmedValue, baseUrl).href
  } catch {
    return null
  }
}

function parseContactDetailsResponse(payload: unknown) {
  if (!isPlainObject(payload) || !isPlainObject(payload.payload)) {
    throw new ChatwootClientRequestError(
      'Chatwoot contact lookup returned an unexpected response shape.',
    )
  }

  return payload.payload
}

function mapContact(payload: unknown, baseUrl: string): ChatwootContact {
  if (!isPlainObject(payload)) {
    throw new ChatwootClientRequestError(
      'Chatwoot contact lookup returned an invalid contact payload.',
    )
  }

  const id = readInteger(payload.id)

  if (id === null) {
    throw new ChatwootClientRequestError(
      'Chatwoot contact lookup returned an invalid contact payload.',
    )
  }

  const customAttributes = readObject(payload.custom_attributes)
  const avatarUrl = resolveChatwootAssetUrl(
    readString(payload.avatar_url) ?? readString(payload.thumbnail),
    baseUrl,
  )

  return {
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(customAttributes ? { customAttributes } : {}),
    email: readString(payload.email),
    id,
    name: readString(payload.name),
    phoneNumber: readString(payload.phone_number),
  }
}

export async function findChatwootContactById({
  config,
  contactId,
  fetchChatwoot,
}: ChatwootContactLookupOptions): Promise<ChatwootContact | null> {
  if (!Number.isInteger(contactId) || contactId <= 0) {
    throw new ChatwootClientRequestError(
      'Chatwoot contact lookup requires a valid contact id.',
    )
  }

  const requestUrl = new URL(
    `/api/v1/accounts/${config.accountId}/contacts/${contactId}`,
    config.baseUrl,
  )
  const request = await fetchChatwoot(
    requestUrl,
    'Chatwoot contact lookup is unavailable.',
    {
      headers: {
        Accept: 'application/json',
        api_access_token: config.apiAccessToken,
      },
      method: 'GET',
    },
  )
  const { response } = request

  try {
    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      throw new ChatwootClientRequestError(
        `Chatwoot contact lookup failed with status ${response.status}.`,
      )
    }

    const payload = await readChatwootJson({
      invalidJsonMessage: 'Chatwoot contact lookup returned invalid JSON.',
      request,
      unavailableMessage: 'Chatwoot contact lookup is unavailable.',
    })

    return mapContact(parseContactDetailsResponse(payload), config.baseUrl)
  } finally {
    request.clearTimeout()
  }
}
