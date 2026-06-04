import { ChatwootClientRequestError } from './errors.js'
import {
  createChatwootFetch,
  normalizeChatwootRequestTimeoutMs,
} from './request.js'

type PublicConversationEventsClientOptions = {
  baseUrl: string
  fetchFn?: typeof fetch
  requestTimeoutMs?: number | undefined
}

type PublicConversationInput = {
  contactIdentifier: string
  conversationDisplayId: number
  inboxIdentifier: string
}

function normalizeIdentifier(value: string, label: string) {
  const normalizedValue = value.trim()

  if (!normalizedValue) {
    throw new ChatwootClientRequestError(
      `Chatwoot public ${label} is required.`,
    )
  }

  return normalizedValue
}

function normalizeConversationDisplayId(value: number) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ChatwootClientRequestError(
      'Chatwoot public conversation display id is required.',
    )
  }

  return value
}

function buildConversationUrl({
  action,
  baseUrl,
  contactIdentifier,
  conversationDisplayId,
  inboxIdentifier,
}: PublicConversationInput & {
  action: 'toggle_typing' | 'update_last_seen'
  baseUrl: string
}) {
  return new URL(
    `/public/api/v1/inboxes/${encodeURIComponent(
      normalizeIdentifier(inboxIdentifier, 'inbox identifier'),
    )}/contacts/${encodeURIComponent(
      normalizeIdentifier(contactIdentifier, 'contact identifier'),
    )}/conversations/${normalizeConversationDisplayId(
      conversationDisplayId,
    )}/${action}`,
    baseUrl,
  )
}

export function createPublicConversationEventsClient({
  baseUrl,
  fetchFn = fetch,
  requestTimeoutMs,
}: PublicConversationEventsClientOptions) {
  const normalizedRequestTimeoutMs =
    normalizeChatwootRequestTimeoutMs(requestTimeoutMs)
  const fetchChatwoot = createChatwootFetch({
    fetchFn,
    requestTimeoutMs: normalizedRequestTimeoutMs,
  })

  async function postPublicConversationEvent(
    input: PublicConversationInput & {
      body?: Record<string, unknown>
      requestName: string
      urlAction: 'toggle_typing' | 'update_last_seen'
    },
  ) {
    const request = await fetchChatwoot(
      buildConversationUrl({
        ...input,
        action: input.urlAction,
        baseUrl,
      }),
      `${input.requestName} is unavailable.`,
      {
        ...(input.body ? { body: JSON.stringify(input.body) } : {}),
        headers: {
          Accept: 'application/json',
          ...(input.body ? { 'Content-Type': 'application/json' } : {}),
        },
        method: 'POST',
      },
    )

    try {
      if (!request.response.ok) {
        throw new ChatwootClientRequestError(
          `${input.requestName} failed with status ${request.response.status}.`,
        )
      }
    } finally {
      request.clearTimeout()
    }
  }

  return {
    updateLastSeen(input: PublicConversationInput) {
      return postPublicConversationEvent({
        ...input,
        requestName: 'Chatwoot public update last seen',
        urlAction: 'update_last_seen',
      })
    },

    toggleTyping(
      input: PublicConversationInput & { typingStatus: 'off' | 'on' },
    ) {
      return postPublicConversationEvent({
        ...input,
        body: {
          typing_status: input.typingStatus,
        },
        requestName: 'Chatwoot public toggle typing',
        urlAction: 'toggle_typing',
      })
    },
  }
}
