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
  email,
  name,
}: {
  email: string
  name: string
}) {
  const env = loadE2eEnv()
  const inboxId = Number(getRequiredRawEnv('CHATWOOT_PORTAL_INBOX_ID'))

  if (!Number.isInteger(inboxId) || inboxId <= 0) {
    throw new Error('CHATWOOT_PORTAL_INBOX_ID must be a positive integer.')
  }

  const requestUrl = new URL(
    `/api/v1/accounts/${env.CHATWOOT_ACCOUNT_ID}/contacts`,
    env.CHATWOOT_BASE_URL,
  )
  const response = await fetch(requestUrl, {
    body: JSON.stringify({
      blocked: false,
      email,
      inbox_id: inboxId,
      name,
    }),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      api_access_token: env.CHATWOOT_API_ACCESS_TOKEN ?? '',
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
