import {
  ChatwootClientConfigurationError,
  ChatwootClientRequestError,
} from './errors.js'

const DEFAULT_CHATWOOT_REQUEST_TIMEOUT_MS = 15_000

type CreateChatwootFetchOptions = {
  fetchFn: typeof fetch
  requestTimeoutMs: number
}

type ChatwootJsonMethod = 'GET' | 'PATCH' | 'POST'

type ReadChatwootJsonOptions = {
  invalidJsonMessage: string
  request: {
    response: Response
    signal: AbortSignal
  }
  unavailableMessage: string
}

type RequestChatwootJsonOptions = {
  apiAccessToken: string
  body: unknown | undefined
  fetchChatwoot: ReturnType<typeof createChatwootFetch>
  method: ChatwootJsonMethod
  requestUrl: URL
  unavailableMessage: string
}

export function normalizeChatwootRequestTimeoutMs(value: number | undefined) {
  if (value === undefined) {
    return DEFAULT_CHATWOOT_REQUEST_TIMEOUT_MS
  }

  if (!Number.isFinite(value) || value <= 0) {
    throw new ChatwootClientConfigurationError(
      'Chatwoot request timeout must be a positive number.',
    )
  }

  return value
}

export function createChatwootFetch({
  fetchFn,
  requestTimeoutMs,
}: CreateChatwootFetchOptions) {
  return async function fetchChatwoot(
    requestUrl: URL,
    unavailableMessage: string,
    init: RequestInit,
  ) {
    const abortController = new AbortController()
    const timeout = setTimeout(
      () => abortController.abort(new Error('Chatwoot request timed out.')),
      requestTimeoutMs,
    )

    try {
      const response = await fetchFn(requestUrl, {
        ...init,
        signal: abortController.signal,
      })

      return {
        clearTimeout: () => clearTimeout(timeout),
        response,
        signal: abortController.signal,
      }
    } catch {
      clearTimeout(timeout)
      throw new ChatwootClientRequestError(unavailableMessage)
    }
  }
}

export async function readChatwootJson({
  invalidJsonMessage,
  request,
  unavailableMessage,
}: ReadChatwootJsonOptions) {
  try {
    return await request.response.json()
  } catch {
    if (request.signal.aborted) {
      throw new ChatwootClientRequestError(unavailableMessage)
    }

    throw new ChatwootClientRequestError(invalidJsonMessage)
  }
}

export async function requestChatwootJson({
  apiAccessToken,
  body,
  fetchChatwoot,
  method,
  requestUrl,
  unavailableMessage,
}: RequestChatwootJsonOptions) {
  const request = await fetchChatwoot(requestUrl, unavailableMessage, {
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      api_access_token: apiAccessToken,
    },
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const { response } = request

  try {
    if (!response.ok) {
      throw new ChatwootClientRequestError(
        `${unavailableMessage} Status: ${response.status}.`,
      )
    }

    return await readChatwootJson({
      invalidJsonMessage: 'Chatwoot returned an invalid JSON response.',
      request,
      unavailableMessage,
    })
  } finally {
    request.clearTimeout()
  }
}
