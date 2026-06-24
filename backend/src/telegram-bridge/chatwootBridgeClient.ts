import {
  type ChatwootContact,
  findChatwootContactsByPhone,
} from '../integrations/chatwoot/contactLookup.js'
import { ChatwootClientRequestError } from '../integrations/chatwoot/errors.js'
import type { createChatwootFetch } from '../integrations/chatwoot/request.js'
import { readChatwootJson } from '../integrations/chatwoot/request.js'
import type { TelegramUpdate } from './types.js'

type ChatwootBridgeClientConfig = {
  accountId: number
  apiAccessToken: string
  baseUrl: string
  botToken: string
  telegramInboxId: number
}

type FindContactsByPhone = typeof findChatwootContactsByPhone

type ChatwootBridgeClientOptions = {
  config: ChatwootBridgeClientConfig
  fetchChatwoot: ReturnType<typeof createChatwootFetch>
  findContactsByPhone?: FindContactsByPhone
}

export type ChatwootContactInboxLink = {
  contactId: number
  inboxId: number
  sourceId: string
}

export type ChatwootSingleContactByPhoneResult =
  | { contact: ChatwootContact; outcome: 'found' }
  | { outcome: 'ambiguous' }
  | { outcome: 'not_found' }

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

function parseContactInboxLink(
  payload: unknown,
  {
    contactId,
    expectedInboxId,
    expectedSourceId,
  }: {
    contactId: number
    expectedInboxId: number
    expectedSourceId: string
  },
) {
  const contactInbox = readObject(payload)
  const inbox = readObject(contactInbox?.inbox)
  const inboxId = readInteger(inbox?.id)
  const sourceId = readString(contactInbox?.source_id)

  if (inboxId !== expectedInboxId || sourceId !== expectedSourceId) {
    return null
  }

  return {
    contactId,
    inboxId,
    sourceId,
  }
}

function parseContactInboxFilterResponse(
  payload: unknown,
  {
    expectedInboxId,
    expectedSourceId,
  }: {
    expectedInboxId: number
    expectedSourceId: string
  },
) {
  const contact = readObject(payload)
  const contactId = readInteger(contact?.id)
  const contactInboxes = contact?.contact_inboxes

  if (contactId === null || !Array.isArray(contactInboxes)) {
    throw new ChatwootClientRequestError(
      'Chatwoot contact inbox lookup returned an unexpected response shape.',
    )
  }

  for (const contactInbox of contactInboxes) {
    const link = parseContactInboxLink(contactInbox, {
      contactId,
      expectedInboxId,
      expectedSourceId,
    })

    if (link) {
      return link
    }
  }

  return null
}

export function maskChatwootTelegramWebhookUrl(value: string) {
  return value.replace(
    /\/webhooks\/telegram\/[^/\s?#]+/g,
    '/webhooks/telegram/[redacted]',
  )
}

export function createChatwootBridgeClient({
  config,
  fetchChatwoot,
  findContactsByPhone = findChatwootContactsByPhone,
}: ChatwootBridgeClientOptions) {
  const contactLookupConfig = {
    accountId: config.accountId,
    apiAccessToken: config.apiAccessToken,
    baseUrl: config.baseUrl,
  }

  return {
    async findContactInboxBySourceId(
      sourceId: string,
    ): Promise<ChatwootContactInboxLink | null> {
      const requestUrl = new URL(
        `/api/v1/accounts/${config.accountId}/contact_inboxes/filter`,
        config.baseUrl,
      )
      const request = await fetchChatwoot(
        requestUrl,
        'Chatwoot contact inbox lookup is unavailable.',
        {
          body: JSON.stringify({
            inbox_id: config.telegramInboxId,
            source_id: sourceId,
          }),
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            api_access_token: config.apiAccessToken,
          },
          method: 'POST',
        },
      )
      const { response } = request

      try {
        if (response.status === 404) {
          return null
        }

        if (!response.ok) {
          throw new ChatwootClientRequestError(
            `Chatwoot contact inbox lookup failed with status ${response.status}.`,
          )
        }

        const payload = await readChatwootJson({
          invalidJsonMessage:
            'Chatwoot contact inbox lookup returned invalid JSON.',
          request,
          unavailableMessage: 'Chatwoot contact inbox lookup is unavailable.',
        })

        return parseContactInboxFilterResponse(payload, {
          expectedInboxId: config.telegramInboxId,
          expectedSourceId: sourceId,
        })
      } finally {
        request.clearTimeout()
      }
    },

    async findSingleContactByPhone(
      phone: string,
    ): Promise<ChatwootSingleContactByPhoneResult> {
      const contacts = await findContactsByPhone({
        config: contactLookupConfig,
        fetchChatwoot,
        phone,
      })

      if (contacts.length === 0) {
        return { outcome: 'not_found' }
      }

      if (contacts.length > 1) {
        return { outcome: 'ambiguous' }
      }

      const [contact] = contacts

      if (!contact) {
        return { outcome: 'not_found' }
      }

      return {
        contact,
        outcome: 'found',
      }
    },

    async createContactInbox(
      contactId: number,
      sourceId: string,
    ): Promise<ChatwootContactInboxLink> {
      if (!Number.isInteger(contactId) || contactId <= 0) {
        throw new ChatwootClientRequestError(
          'Chatwoot contact inbox creation requires a valid contact id.',
        )
      }

      const requestUrl = new URL(
        `/api/v1/accounts/${config.accountId}/contacts/${contactId}/contact_inboxes`,
        config.baseUrl,
      )
      const request = await fetchChatwoot(
        requestUrl,
        'Chatwoot contact inbox creation is unavailable.',
        {
          body: JSON.stringify({
            inbox_id: config.telegramInboxId,
            source_id: sourceId,
          }),
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            api_access_token: config.apiAccessToken,
          },
          method: 'POST',
        },
      )
      const { response } = request

      try {
        if (!response.ok) {
          throw new ChatwootClientRequestError(
            `Chatwoot contact inbox creation failed with status ${response.status}.`,
          )
        }

        const payload = await readChatwootJson({
          invalidJsonMessage:
            'Chatwoot contact inbox creation returned invalid JSON.',
          request,
          unavailableMessage: 'Chatwoot contact inbox creation is unavailable.',
        })
        const link = parseContactInboxLink(payload, {
          contactId,
          expectedInboxId: config.telegramInboxId,
          expectedSourceId: sourceId,
        })

        if (!link) {
          throw new ChatwootClientRequestError(
            'Chatwoot contact inbox creation returned a mismatched link.',
          )
        }

        return link
      } finally {
        request.clearTimeout()
      }
    },

    async forwardTelegramUpdateToChatwoot(payload: TelegramUpdate) {
      const requestUrl = new URL(
        `/webhooks/telegram/${config.botToken}`,
        config.baseUrl,
      )
      const maskedUrl = maskChatwootTelegramWebhookUrl(requestUrl.href)
      const request = await fetchChatwoot(
        requestUrl,
        `Chatwoot Telegram webhook forward is unavailable for ${maskedUrl}.`,
        {
          body: JSON.stringify(payload),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        },
      )

      try {
        if (!request.response.ok) {
          throw new ChatwootClientRequestError(
            `Chatwoot Telegram webhook forward failed for ${maskedUrl} with status ${request.response.status}.`,
          )
        }
      } finally {
        request.clearTimeout()
      }
    },
  }
}
