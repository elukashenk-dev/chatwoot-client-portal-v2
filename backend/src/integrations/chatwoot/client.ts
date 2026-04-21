import type { AppEnv } from '../../config/env.js'
import { normalizeEmail } from '../../lib/email.js'

type ChatwootContactSearchPayload = {
  email?: string | null
  id?: number
  name?: string | null
}

type ChatwootContactSearchResponse = {
  payload?: ChatwootContactSearchPayload[]
}

export type ChatwootContact = {
  email: string | null
  id: number
  name: string | null
}

export class ChatwootClientConfigurationError extends Error {
  constructor(message = 'Chatwoot integration is not configured.') {
    super(message)

    this.name = 'ChatwootClientConfigurationError'
  }
}

export class ChatwootClientRequestError extends Error {
  constructor(message = 'Chatwoot request failed.') {
    super(message)

    this.name = 'ChatwootClientRequestError'
  }
}

type CreateChatwootClientOptions = {
  env: Pick<
    AppEnv,
    'CHATWOOT_ACCOUNT_ID' | 'CHATWOOT_API_ACCESS_TOKEN' | 'CHATWOOT_BASE_URL'
  >
  fetchFn?: typeof fetch
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '')
}

export function createChatwootClient({
  env,
  fetchFn = fetch,
}: CreateChatwootClientOptions) {
  const config =
    env.CHATWOOT_BASE_URL &&
    env.CHATWOOT_ACCOUNT_ID &&
    env.CHATWOOT_API_ACCESS_TOKEN
      ? {
          accountId: env.CHATWOOT_ACCOUNT_ID,
          apiAccessToken: env.CHATWOOT_API_ACCESS_TOKEN,
          baseUrl: normalizeBaseUrl(env.CHATWOOT_BASE_URL),
        }
      : null

  return {
    async findContactByEmail(email: string): Promise<ChatwootContact | null> {
      if (!config) {
        throw new ChatwootClientConfigurationError()
      }

      const normalizedEmail = normalizeEmail(email)
      const requestUrl = new URL(
        `/api/v1/accounts/${config.accountId}/contacts/search`,
        config.baseUrl,
      )

      requestUrl.searchParams.set('q', normalizedEmail)

      let response: Response

      try {
        response = await fetchFn(requestUrl, {
          headers: {
            Accept: 'application/json',
            api_access_token: config.apiAccessToken,
          },
          method: 'GET',
        })
      } catch {
        throw new ChatwootClientRequestError(
          'Chatwoot contact search is unavailable.',
        )
      }

      if (!response.ok) {
        throw new ChatwootClientRequestError(
          `Chatwoot contact search failed with status ${response.status}.`,
        )
      }

      let payload: ChatwootContactSearchResponse

      try {
        payload = (await response.json()) as ChatwootContactSearchResponse
      } catch {
        throw new ChatwootClientRequestError(
          'Chatwoot returned an invalid contact search response.',
        )
      }

      const exactMatch = payload.payload?.find((candidate) => {
        if (typeof candidate.id !== 'number') {
          return false
        }

        if (!candidate.email) {
          return false
        }

        return normalizeEmail(candidate.email) === normalizedEmail
      })

      if (!exactMatch) {
        return null
      }

      if (typeof exactMatch.id !== 'number') {
        return null
      }

      return {
        email: exactMatch.email ?? null,
        id: exactMatch.id,
        name: exactMatch.name ?? null,
      }
    },
  }
}

export type ChatwootClient = ReturnType<typeof createChatwootClient>
