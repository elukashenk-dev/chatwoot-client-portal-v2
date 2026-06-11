import {
  ChatwootClientConfigurationError,
  ChatwootClientRequestError,
} from './errors.js'
import {
  createChatwootFetch,
  normalizeChatwootRequestTimeoutMs,
  requestChatwootJson,
  requestChatwootWithoutBody,
} from './request.js'

export type ChatwootPlatformClientConfig = {
  apiAccessToken: string
  baseUrl: string
}

export type ChatwootPlatformAccount = {
  customAttributes: Record<string, unknown>
  id: number
  name: string
}

export type ChatwootPlatformUser = {
  accessToken: string | null
  email: string
  id: number
  name: string
}

export type ChatwootPlatformClient = {
  addAccountUser(input: {
    accountId: number
    role: 'administrator' | 'agent'
    userId: number
  }): Promise<void>
  createAccount(input: {
    customAttributes: Record<string, unknown>
    name: string
  }): Promise<ChatwootPlatformAccount>
  createUser(input: {
    customAttributes: Record<string, unknown>
    email: string
    name: string
    password: string
  }): Promise<ChatwootPlatformUser>
  deleteAccount(accountId: number): Promise<void>
  getAccount(accountId: number): Promise<ChatwootPlatformAccount>
  getUserToken(userId: number): Promise<string>
  listAccounts(): Promise<ChatwootPlatformAccount[]>
}

type CreateChatwootPlatformClientOptions = {
  config: ChatwootPlatformClientConfig
  fetchFn?: typeof fetch
  requestTimeoutMs?: number | undefined
}

function normalizeBaseUrl(value: string) {
  let parsedUrl: URL

  try {
    parsedUrl = new URL(value.trim())
  } catch {
    throw new ChatwootClientConfigurationError(
      'Chatwoot Platform API base URL must be a valid URL.',
    )
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new ChatwootClientConfigurationError(
      'Chatwoot Platform API base URL must use http or https.',
    )
  }

  parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, '')
  parsedUrl.search = ''
  parsedUrl.hash = ''

  return parsedUrl.toString().replace(/\/$/, '')
}

function normalizeNonEmptyString(value: string, fieldName: string) {
  const normalizedValue = value.trim()

  if (!normalizedValue) {
    throw new ChatwootClientConfigurationError(`${fieldName} is required.`)
  }

  return normalizedValue
}

function normalizePositiveInteger(value: number, fieldName: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ChatwootClientConfigurationError(
      `${fieldName} must be a positive integer.`,
    )
  }

  return value
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

function parsePlatformAccount(payload: unknown): ChatwootPlatformAccount {
  const account = readObject(payload)
  const id = readInteger(account?.id)
  const name = readString(account?.name)
  const customAttributes = readObject(account?.custom_attributes) ?? {}

  if (id === null || !name) {
    throw new ChatwootClientRequestError(
      'Chatwoot Platform account response has an unexpected shape.',
    )
  }

  return {
    customAttributes,
    id,
    name,
  }
}

function parsePlatformAccounts(payload: unknown): ChatwootPlatformAccount[] {
  if (!Array.isArray(payload)) {
    throw new ChatwootClientRequestError(
      'Chatwoot Platform accounts response has an unexpected shape.',
    )
  }

  return payload.map(parsePlatformAccount)
}

function parsePlatformUser(payload: unknown): ChatwootPlatformUser {
  const user = readObject(payload)
  const accessToken = readString(user?.access_token)
  const email = readString(user?.email)
  const id = readInteger(user?.id)
  const name = readString(user?.name)

  if (id === null || !email || !name) {
    throw new ChatwootClientRequestError(
      'Chatwoot Platform user response has an unexpected shape.',
    )
  }

  return {
    accessToken,
    email,
    id,
    name,
  }
}

function parseUserToken(payload: unknown) {
  const tokenResponse = readObject(payload)
  const accessToken = readString(tokenResponse?.access_token)

  if (!accessToken) {
    throw new ChatwootClientRequestError(
      'Chatwoot Platform user token response has an unexpected shape.',
    )
  }

  return accessToken
}

function normalizeConfig(
  config: ChatwootPlatformClientConfig,
): ChatwootPlatformClientConfig {
  return {
    apiAccessToken: normalizeNonEmptyString(
      config.apiAccessToken,
      'apiAccessToken',
    ),
    baseUrl: normalizeBaseUrl(config.baseUrl),
  }
}

export function createChatwootPlatformClient({
  config,
  fetchFn = fetch,
  requestTimeoutMs,
}: CreateChatwootPlatformClientOptions): ChatwootPlatformClient {
  const normalizedConfig = normalizeConfig(config)
  const normalizedRequestTimeoutMs =
    normalizeChatwootRequestTimeoutMs(requestTimeoutMs)
  const fetchChatwoot = createChatwootFetch({
    fetchFn,
    requestTimeoutMs: normalizedRequestTimeoutMs,
  })

  function buildPlatformUrl(pathname: string) {
    return new URL(`${normalizedConfig.baseUrl}/platform/api/v1${pathname}`)
  }

  async function requestJson({
    body,
    method,
    pathname,
    unavailableMessage,
  }: {
    body?: unknown
    method: 'GET' | 'POST'
    pathname: string
    unavailableMessage: string
  }) {
    return requestChatwootJson({
      apiAccessToken: normalizedConfig.apiAccessToken,
      body,
      fetchChatwoot,
      method,
      requestUrl: buildPlatformUrl(pathname),
      unavailableMessage,
    })
  }

  return {
    async addAccountUser({ accountId, role, userId }) {
      await requestJson({
        body: {
          role,
          user_id: normalizePositiveInteger(userId, 'userId'),
        },
        method: 'POST',
        pathname: `/accounts/${normalizePositiveInteger(
          accountId,
          'accountId',
        )}/account_users`,
        unavailableMessage: 'Chatwoot Platform account user request failed.',
      })
    },

    async createAccount({ customAttributes, name }) {
      const response = await requestJson({
        body: {
          custom_attributes: customAttributes,
          name: normalizeNonEmptyString(name, 'name'),
        },
        method: 'POST',
        pathname: '/accounts',
        unavailableMessage: 'Chatwoot Platform account creation failed.',
      })

      return parsePlatformAccount(response)
    },

    async createUser({ customAttributes, email, name, password }) {
      const response = await requestJson({
        body: {
          custom_attributes: customAttributes,
          email: normalizeNonEmptyString(email, 'email'),
          name: normalizeNonEmptyString(name, 'name'),
          password: normalizeNonEmptyString(password, 'password'),
        },
        method: 'POST',
        pathname: '/users',
        unavailableMessage: 'Chatwoot Platform user creation failed.',
      })

      return parsePlatformUser(response)
    },

    async deleteAccount(accountId) {
      await requestChatwootWithoutBody({
        apiAccessToken: normalizedConfig.apiAccessToken,
        fetchChatwoot,
        method: 'DELETE',
        requestUrl: buildPlatformUrl(
          `/accounts/${normalizePositiveInteger(accountId, 'accountId')}`,
        ),
        unavailableMessage: 'Chatwoot Platform account deletion failed.',
      })
    },

    async getAccount(accountId) {
      const response = await requestJson({
        method: 'GET',
        pathname: `/accounts/${normalizePositiveInteger(
          accountId,
          'accountId',
        )}`,
        unavailableMessage: 'Chatwoot Platform account lookup failed.',
      })

      return parsePlatformAccount(response)
    },

    async getUserToken(userId) {
      const response = await requestJson({
        method: 'POST',
        pathname: `/users/${normalizePositiveInteger(userId, 'userId')}/token`,
        unavailableMessage: 'Chatwoot Platform user token request failed.',
      })

      return parseUserToken(response)
    },

    async listAccounts() {
      const response = await requestJson({
        method: 'GET',
        pathname: '/accounts',
        unavailableMessage: 'Chatwoot Platform accounts lookup failed.',
      })

      return parsePlatformAccounts(response)
    },
  }
}
