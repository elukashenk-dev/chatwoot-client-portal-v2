import { getRequiredRawEnv, loadE2eEnv } from './runtimeEnv.ts'

type ChatwootContactPayload = {
  id?: unknown
  payload?: unknown
}

function readContactId(payload: ChatwootContactPayload) {
  if (typeof payload.id === 'number') {
    return payload.id
  }

  if (
    typeof payload.payload === 'object' &&
    payload.payload !== null &&
    'contact' in payload.payload &&
    typeof payload.payload.contact === 'object' &&
    payload.payload.contact !== null &&
    'id' in payload.payload.contact &&
    typeof payload.payload.contact.id === 'number'
  ) {
    return payload.payload.contact.id
  }

  if (
    typeof payload.payload === 'object' &&
    payload.payload !== null &&
    'id' in payload.payload &&
    typeof payload.payload.id === 'number'
  ) {
    return payload.payload.id
  }

  if (Array.isArray(payload.payload)) {
    const firstContact = payload.payload[0]

    if (
      typeof firstContact === 'object' &&
      firstContact !== null &&
      'id' in firstContact &&
      typeof firstContact.id === 'number'
    ) {
      return firstContact.id
    }
  }

  throw new Error('Chatwoot create contact response did not include an id.')
}

export async function createChatwootContactForE2e({
  customAttributes,
  email,
  name,
}: {
  customAttributes?: Record<string, unknown>
  email: string
  name: string
}) {
  loadE2eEnv()

  const accountId = getRequiredRawEnv('E2E_CHATWOOT_ACCOUNT_ID')
  const apiAccessToken = getRequiredRawEnv('E2E_CHATWOOT_API_ACCESS_TOKEN')
  const baseUrl = getRequiredRawEnv('E2E_CHATWOOT_BASE_URL')
  const inboxId = Number(getRequiredRawEnv('E2E_CHATWOOT_PORTAL_INBOX_ID'))
  const parsedBaseUrl = new URL(baseUrl)

  if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsedBaseUrl.hostname)) {
    throw new Error(
      'E2E_CHATWOOT_BASE_URL must point to a loopback development host.',
    )
  }

  if (!Number.isInteger(inboxId) || inboxId <= 0) {
    throw new Error('E2E_CHATWOOT_PORTAL_INBOX_ID must be a positive integer.')
  }

  const requestUrl = new URL(
    `/api/v1/accounts/${accountId}/contacts`,
    parsedBaseUrl,
  )
  const response = await fetch(requestUrl, {
    body: JSON.stringify({
      blocked: false,
      custom_attributes: customAttributes ?? {},
      email,
      inbox_id: inboxId,
      name,
    }),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      api_access_token: apiAccessToken,
    },
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(
      `Chatwoot create contact failed with status ${response.status}.`,
    )
  }

  const payload = (await response.json()) as ChatwootContactPayload

  return {
    id: readContactId(payload),
  }
}
