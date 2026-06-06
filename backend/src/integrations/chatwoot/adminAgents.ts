import { normalizeEmail } from '../../lib/email.js'
import { ChatwootClientRequestError } from './errors.js'
import {
  createChatwootFetch,
  normalizeChatwootRequestTimeoutMs,
  requestChatwootJson,
} from './request.js'

export type ChatwootAdminAgent = {
  accountId: number
  confirmed: boolean
  email: string
  id: number
  role: string
}

export type ChatwootAdminAgentsClientConfig = {
  accountId: number
  apiAccessToken: string
  baseUrl: string
}

type CreateChatwootAdminAgentsClientOptions = {
  config: ChatwootAdminAgentsClientConfig
  fetchFn?: typeof fetch
  requestTimeoutMs?: number | undefined
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '')
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function parseChatwootAdminAgent(
  payload: unknown,
  expectedAccountId: number,
): ChatwootAdminAgent | null {
  if (!isPlainObject(payload)) {
    return null
  }

  const accountId = readInteger(payload.account_id)
  const id = readInteger(payload.id)
  const email = readString(payload.email)
  const role = readString(payload.role)
  const confirmed =
    typeof payload.confirmed === 'boolean' ? payload.confirmed : null

  if (
    accountId !== expectedAccountId ||
    id === null ||
    email === null ||
    role === null ||
    confirmed === null
  ) {
    return null
  }

  return {
    accountId,
    confirmed,
    email: normalizeEmail(email),
    id,
    role,
  }
}

export function parseChatwootAdminAgentsResponse(
  payload: unknown,
  expectedAccountId: number,
) {
  if (!Array.isArray(payload)) {
    throw new ChatwootClientRequestError(
      'Chatwoot agents lookup returned an unexpected response shape.',
    )
  }

  return payload
    .map((agent) => parseChatwootAdminAgent(agent, expectedAccountId))
    .filter((agent): agent is ChatwootAdminAgent => agent !== null)
}

export function createChatwootAdminAgentsClient({
  config,
  fetchFn = fetch,
  requestTimeoutMs,
}: CreateChatwootAdminAgentsClientOptions) {
  const normalizedConfig = {
    ...config,
    baseUrl: normalizeBaseUrl(config.baseUrl),
  }
  const fetchChatwoot = createChatwootFetch({
    fetchFn,
    requestTimeoutMs: normalizeChatwootRequestTimeoutMs(requestTimeoutMs),
  })

  return {
    async listAccountAgents() {
      const payload = await requestChatwootJson({
        apiAccessToken: normalizedConfig.apiAccessToken,
        body: undefined,
        fetchChatwoot,
        method: 'GET',
        requestUrl: new URL(
          `/api/v1/accounts/${normalizedConfig.accountId}/agents`,
          normalizedConfig.baseUrl,
        ),
        unavailableMessage: 'Chatwoot agents lookup failed.',
      })

      return parseChatwootAdminAgentsResponse(
        payload,
        normalizedConfig.accountId,
      )
    },
  }
}

export type ChatwootAdminAgentsClient = ReturnType<
  typeof createChatwootAdminAgentsClient
>
