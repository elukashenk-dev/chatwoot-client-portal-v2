import type { AppEnv } from '../../config/env.js'
import { normalizeEmail } from '../../lib/email.js'
import {
  ChatwootClientConfigurationError,
  ChatwootClientRequestError,
  ChatwootInvalidHistoryCursorError,
} from './errors.js'
import { mapMessage } from './messagePayload.js'
import type { ChatwootMessage, ChatwootMessagesPage } from './messagePayload.js'
import {
  createChatwootFetch,
  normalizeChatwootRequestTimeoutMs,
  readChatwootJson,
  requestChatwootJson,
} from './request.js'

export {
  ChatwootClientConfigurationError,
  ChatwootClientRequestError,
  ChatwootInvalidHistoryCursorError,
} from './errors.js'
export type {
  ChatwootMessage,
  ChatwootMessageAttachment,
  ChatwootMessagesPage,
} from './messagePayload.js'

const PORTAL_CONVERSATION_CHANNEL_TYPE = 'Channel::Api'
const CONTACT_CONVERSATIONS_PAGE_LIMIT = 20
const ACCOUNT_CONVERSATIONS_LOOKUP_MAX_PAGES = 5
const MESSAGE_PAGE_SIZE = 20

type ChatwootContactSearchPayload = {
  email?: string | null
  id?: number
  name?: string | null
}

type ChatwootContactSearchResponse = {
  payload?: ChatwootContactSearchPayload[]
}

type ChatwootContactConversationsResponse = {
  payload: unknown[]
}

type ChatwootContactDetailsResponse = {
  payload: unknown
}

type ChatwootAccountConversationsResponse = {
  allCount: number
  payload: unknown[]
}

type ChatwootMessagesResponse = {
  payload: unknown[]
}

type ChatwootContactInboxResponse = {
  inboxId: number
  sourceId: string
}

type ChatwootAccountWebhooksResponse = {
  payload: {
    webhooks: unknown[]
  }
}

type ChatwootAccountWebhookResponse = {
  payload: {
    webhook: unknown
  }
}

export type ChatwootContact = {
  email: string | null
  id: number
  name: string | null
}

export type ChatwootConversation = {
  assigneeName: string | null
  channelType: string | null
  createdAt: number | null
  id: number
  inboxId: number
  lastActivityAt: number | null
  status: string
}

export type ChatwootPortalInboxRouting = {
  channelType: string | null
  id: number
  lockToSingleConversation: boolean
  webhookSecret: string | null
  webhookUrl: string | null
}

export type ChatwootPortalInboxWebhook = {
  id: number
  secret: string | null
  url: string | null
}

export type ChatwootAttachmentUpload = {
  data: Uint8Array
  fileName: string
  mimeType: string
}

export type ChatwootContactInbox = {
  inboxId: number
  sourceId: string
}

export type ChatwootAccountWebhook = {
  id: number
  name: string | null
  secret: string | null
  subscriptions: string[]
  url: string
}

export type ChatwootClientConfig = {
  accountId: number
  apiAccessToken: string
  baseUrl: string
  portalInboxId: number
}

type ChatwootEnvConfig = Pick<
  AppEnv,
  | 'CHATWOOT_ACCOUNT_ID'
  | 'CHATWOOT_API_ACCESS_TOKEN'
  | 'CHATWOOT_BASE_URL'
  | 'CHATWOOT_PORTAL_INBOX_ID'
>

type CreateChatwootClientOptions = {
  config?: ChatwootClientConfig | null | undefined
  env?: ChatwootEnvConfig | undefined
  fetchFn?: typeof fetch
  requestTimeoutMs?: number | undefined
}

type CreateChatwootClientFactoryOptions = {
  fetchFn?: typeof fetch
  requestTimeoutMs?: number | undefined
}

function resolveConfigFromEnv(env: ChatwootEnvConfig) {
  return env.CHATWOOT_BASE_URL &&
    env.CHATWOOT_ACCOUNT_ID &&
    env.CHATWOOT_API_ACCESS_TOKEN &&
    env.CHATWOOT_PORTAL_INBOX_ID
    ? {
        accountId: env.CHATWOOT_ACCOUNT_ID,
        apiAccessToken: env.CHATWOOT_API_ACCESS_TOKEN,
        baseUrl: env.CHATWOOT_BASE_URL,
        portalInboxId: env.CHATWOOT_PORTAL_INBOX_ID,
      }
    : null
}

function normalizeConfig(
  config: ChatwootClientConfig | null | undefined,
): ChatwootClientConfig | null {
  if (!config) {
    return null
  }

  return {
    accountId: config.accountId,
    apiAccessToken: config.apiAccessToken,
    baseUrl: normalizeBaseUrl(config.baseUrl),
    portalInboxId: config.portalInboxId,
  }
}

function resolveInitialConfig({
  config,
  env,
}: Pick<CreateChatwootClientOptions, 'config' | 'env'>) {
  if (config !== undefined) {
    return normalizeConfig(config)
  }

  return normalizeConfig(env ? resolveConfigFromEnv(env) : null)
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
  return typeof value === 'string' ? value : null
}

function readTrimmedString(value: unknown) {
  const stringValue = readString(value)?.trim()

  return stringValue || null
}

function readObject(value: unknown) {
  return isPlainObject(value) ? value : null
}

function readAssigneeName(conversation: Record<string, unknown>) {
  const meta = readObject(conversation.meta)
  const metaAssignee = readObject(meta?.assignee)
  const directAssignee = readObject(conversation.assignee)
  const assigneeName =
    readString(metaAssignee?.name) ??
    readString(metaAssignee?.available_name) ??
    readString(metaAssignee?.display_name) ??
    readString(directAssignee?.name) ??
    readString(directAssignee?.available_name) ??
    readString(directAssignee?.display_name)

  return assigneeName?.trim() ? assigneeName.trim() : null
}

function parseContactConversationsResponse(
  payload: unknown,
): ChatwootContactConversationsResponse {
  if (!isPlainObject(payload) || !Array.isArray(payload.payload)) {
    throw new ChatwootClientRequestError(
      'Chatwoot contact conversations lookup returned an unexpected response shape.',
    )
  }

  return {
    payload: payload.payload,
  }
}

function parseContactDetailsResponse(
  payload: unknown,
): ChatwootContactDetailsResponse {
  if (!isPlainObject(payload) || !isPlainObject(payload.payload)) {
    throw new ChatwootClientRequestError(
      'Chatwoot contact lookup returned an unexpected response shape.',
    )
  }

  return {
    payload: payload.payload,
  }
}

function parseAccountConversationsResponse(
  payload: unknown,
): ChatwootAccountConversationsResponse {
  const data = isPlainObject(payload) ? readObject(payload.data) : null
  const meta = readObject(data?.meta)
  const allCount = readInteger(meta?.all_count)
  const rawPayload = data?.payload

  if (allCount === null || !Array.isArray(rawPayload)) {
    throw new ChatwootClientRequestError(
      'Chatwoot account conversations lookup returned an unexpected response shape.',
    )
  }

  return {
    allCount,
    payload: rawPayload,
  }
}

function mapPortalInboxRouting(payload: unknown): ChatwootPortalInboxRouting {
  if (!isPlainObject(payload)) {
    throw new ChatwootClientRequestError(
      'Chatwoot inbox lookup returned an unexpected response shape.',
    )
  }

  const id = readInteger(payload.id)
  const channelType = readString(payload.channel_type)
  const lockToSingleConversation =
    typeof payload.lock_to_single_conversation === 'boolean'
      ? payload.lock_to_single_conversation
      : null

  if (id === null || lockToSingleConversation === null) {
    throw new ChatwootClientRequestError(
      'Chatwoot inbox lookup returned an invalid inbox payload.',
    )
  }

  return {
    channelType,
    id,
    lockToSingleConversation,
    webhookSecret: readTrimmedString(payload.secret),
    webhookUrl: readTrimmedString(payload.webhook_url),
  }
}

function mapConversation(payload: unknown): ChatwootConversation {
  if (!isPlainObject(payload)) {
    throw new ChatwootClientRequestError(
      'Chatwoot contact conversations lookup returned an invalid conversation payload.',
    )
  }

  const id = readInteger(payload.id)
  const inboxId = readInteger(payload.inbox_id)
  const status = readString(payload.status)

  if (id === null || inboxId === null || !status) {
    throw new ChatwootClientRequestError(
      'Chatwoot contact conversations lookup returned an invalid conversation payload.',
    )
  }

  const meta = readObject(payload.meta)

  return {
    assigneeName: readAssigneeName(payload),
    channelType: readString(meta?.channel),
    createdAt: readInteger(payload.created_at),
    id,
    inboxId,
    lastActivityAt: readInteger(payload.last_activity_at),
    status,
  }
}

function parseMessagesResponse(payload: unknown): ChatwootMessagesResponse {
  if (!isPlainObject(payload) || !Array.isArray(payload.payload)) {
    throw new ChatwootClientRequestError(
      'Chatwoot messages lookup returned an unexpected response shape.',
    )
  }

  return {
    payload: payload.payload,
  }
}

function mapContactInbox(payload: unknown): ChatwootContactInboxResponse {
  if (!isPlainObject(payload)) {
    throw new ChatwootClientRequestError(
      'Chatwoot contact inbox lookup returned an unexpected response shape.',
    )
  }

  const sourceId = readString(payload.source_id)?.trim()
  const inbox = readObject(payload.inbox)
  const inboxId = readInteger(inbox?.id)

  if (!sourceId || inboxId === null) {
    throw new ChatwootClientRequestError(
      'Chatwoot contact inbox lookup returned an invalid contact inbox payload.',
    )
  }

  return {
    inboxId,
    sourceId,
  }
}

function parseAccountWebhooksResponse(
  payload: unknown,
): ChatwootAccountWebhooksResponse {
  const parsedPayload = readObject(payload)
  const parsedPayloadBody = readObject(parsedPayload?.payload)
  const webhooks = parsedPayloadBody?.webhooks

  if (!Array.isArray(webhooks)) {
    throw new ChatwootClientRequestError(
      'Chatwoot webhooks lookup returned an unexpected response shape.',
    )
  }

  return {
    payload: {
      webhooks,
    },
  }
}

function parseAccountWebhookResponse(
  payload: unknown,
): ChatwootAccountWebhookResponse {
  const parsedPayload = readObject(payload)
  const parsedPayloadBody = readObject(parsedPayload?.payload)
  const webhook = parsedPayloadBody?.webhook

  if (!isPlainObject(webhook)) {
    throw new ChatwootClientRequestError(
      'Chatwoot webhook save returned an unexpected response shape.',
    )
  }

  return {
    payload: {
      webhook,
    },
  }
}

function mapAccountWebhook(payload: unknown): ChatwootAccountWebhook {
  if (!isPlainObject(payload)) {
    throw new ChatwootClientRequestError(
      'Chatwoot webhook API returned an invalid webhook payload.',
    )
  }

  const id = readInteger(payload.id)
  const url = readString(payload.url)?.trim()

  if (id === null || !url) {
    throw new ChatwootClientRequestError(
      'Chatwoot webhook API returned an invalid webhook payload.',
    )
  }

  return {
    id,
    name: readString(payload.name),
    secret: readString(payload.secret),
    subscriptions: Array.isArray(payload.subscriptions)
      ? payload.subscriptions
          .map((subscription) => readString(subscription)?.trim() ?? '')
          .filter(Boolean)
      : [],
    url,
  }
}

function sortMessages(messages: ChatwootMessage[]) {
  return [...messages].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt - right.createdAt
    }

    return left.id - right.id
  })
}

function buildMessagesPage(messages: ChatwootMessage[]) {
  return sortMessages(messages).slice(-MESSAGE_PAGE_SIZE)
}

function isPortalConversation(
  conversation: ChatwootConversation,
  portalInboxId: number | undefined,
) {
  return (
    conversation.channelType === PORTAL_CONVERSATION_CHANNEL_TYPE &&
    portalInboxId !== undefined &&
    conversation.inboxId === portalInboxId
  )
}

function collectPortalContactSourceIds(
  contactPayload: unknown,
  portalInboxId: number,
) {
  if (!isPlainObject(contactPayload)) {
    throw new ChatwootClientRequestError(
      'Chatwoot contact lookup returned an invalid contact payload.',
    )
  }

  if (!Array.isArray(contactPayload.contact_inboxes)) {
    return []
  }

  return [
    ...new Set(
      contactPayload.contact_inboxes
        .map((rawContactInbox) => {
          const contactInbox = readObject(rawContactInbox)
          const inbox = readObject(contactInbox?.inbox)
          const inboxId =
            readInteger(inbox?.id) ?? readInteger(contactInbox?.inbox_id)
          const sourceId = readString(contactInbox?.source_id)?.trim()

          if (inboxId !== portalInboxId || !sourceId) {
            return null
          }

          return sourceId
        })
        .filter((sourceId): sourceId is string => sourceId !== null),
    ),
  ]
}

export function createChatwootClient({
  config: initialConfig,
  env,
  fetchFn = fetch,
  requestTimeoutMs: inputRequestTimeoutMs,
}: CreateChatwootClientOptions) {
  const config = resolveInitialConfig({
    config: initialConfig,
    env,
  })
  const requestTimeoutMs = normalizeChatwootRequestTimeoutMs(inputRequestTimeoutMs)
  const fetchChatwoot = createChatwootFetch({ fetchFn, requestTimeoutMs })

  function assertConfigured(): {
    accountId: number
    apiAccessToken: string
    baseUrl: string
    portalInboxId: number
  } {
    if (!config || !config.portalInboxId) {
      throw new ChatwootClientConfigurationError()
    }

    return {
      accountId: config.accountId,
      apiAccessToken: config.apiAccessToken,
      baseUrl: config.baseUrl,
      portalInboxId: config.portalInboxId,
    }
  }

  async function requestJson(
    requestUrl: URL,
    unavailableMessage: string,
    {
      body,
      method = 'GET',
    }: {
      body?: unknown
      method?: 'GET' | 'PATCH' | 'POST'
    } = {},
  ): Promise<unknown> {
    const resolvedConfig = assertConfigured()
    return requestChatwootJson({
      apiAccessToken: resolvedConfig.apiAccessToken,
      body,
      fetchChatwoot,
      method,
      requestUrl,
      unavailableMessage,
    })
  }

  async function fetchContactDetails(contactId: number) {
    const resolvedConfig = assertConfigured()
    const requestUrl = new URL(
      `/api/v1/accounts/${resolvedConfig.accountId}/contacts/${contactId}`,
      resolvedConfig.baseUrl,
    )

    requestUrl.searchParams.set('include_contact_inboxes', 'true')

    const payload = await requestJson(
      requestUrl,
      'Chatwoot contact lookup is unavailable.',
    )

    return parseContactDetailsResponse(payload).payload
  }

  async function fetchAccountConversationsBySourceId({
    page,
    sourceId,
  }: {
    page: number
    sourceId: string
  }) {
    const resolvedConfig = assertConfigured()
    const requestUrl = new URL(
      `/api/v1/accounts/${resolvedConfig.accountId}/conversations`,
      resolvedConfig.baseUrl,
    )

    requestUrl.searchParams.set('status', 'all')
    requestUrl.searchParams.set('source_id', sourceId)
    requestUrl.searchParams.set('page', String(page))

    const payload = await requestJson(
      requestUrl,
      'Chatwoot account conversations lookup is unavailable.',
    )
    const parsed = parseAccountConversationsResponse(payload)

    return {
      allCount: parsed.allCount,
      conversations: parsed.payload.map(mapConversation),
    }
  }

  async function fetchAllAccountConversationsBySourceId(sourceId: string) {
    let currentPage = 1
    let pageSize: number | null = null
    let totalPages = 1
    const conversations: ChatwootConversation[] = []

    while (currentPage <= totalPages) {
      if (currentPage > ACCOUNT_CONVERSATIONS_LOOKUP_MAX_PAGES) {
        throw new ChatwootClientRequestError(
          'Chatwoot account conversations lookup exceeded the pagination safety cap.',
        )
      }

      const pageResult = await fetchAccountConversationsBySourceId({
        page: currentPage,
        sourceId,
      })

      if (currentPage === 1) {
        if (
          pageResult.conversations.length === 0 ||
          pageResult.allCount === 0
        ) {
          return []
        }

        pageSize = pageResult.conversations.length
        totalPages = Math.ceil(pageResult.allCount / pageSize)
      }

      conversations.push(...pageResult.conversations)

      if (
        pageResult.conversations.length <
        (pageSize ?? pageResult.conversations.length)
      ) {
        break
      }

      currentPage += 1
    }

    return conversations
  }

  async function getPortalInboxRouting() {
    const resolvedConfig = assertConfigured()
    const requestUrl = new URL(
      `/api/v1/accounts/${resolvedConfig.accountId}/inboxes/${resolvedConfig.portalInboxId}`,
      resolvedConfig.baseUrl,
    )
    const payload = await requestJson(
      requestUrl,
      'Chatwoot portal inbox lookup is unavailable.',
    )

    return mapPortalInboxRouting(payload)
  }

  function normalizeWebhookUrl(value: string) {
    const normalizedValue = value.trim()

    if (!normalizedValue) {
      throw new ChatwootClientRequestError(
        'Chatwoot webhook save requires a callback URL.',
      )
    }

    return normalizedValue
  }

  function normalizeWebhookSubscriptions(subscriptions: string[]) {
    const normalizedSubscriptions = [
      ...new Set(
        subscriptions
          .map((subscription) => subscription.trim())
          .filter(Boolean),
      ),
    ]

    if (normalizedSubscriptions.length === 0) {
      throw new ChatwootClientRequestError(
        'Chatwoot webhook save requires at least one subscription.',
      )
    }

    return normalizedSubscriptions
  }

  async function saveAccountWebhook({
    name,
    subscriptions,
    url,
    webhookId = null,
  }: {
    name?: string | null
    subscriptions: string[]
    url: string
    webhookId?: number | null
  }) {
    const resolvedConfig = assertConfigured()
    const normalizedUrl = normalizeWebhookUrl(url)
    const normalizedSubscriptions = normalizeWebhookSubscriptions(subscriptions)
    const requestUrl =
      webhookId === null
        ? new URL(
            `/api/v1/accounts/${resolvedConfig.accountId}/webhooks`,
            resolvedConfig.baseUrl,
          )
        : new URL(
            `/api/v1/accounts/${resolvedConfig.accountId}/webhooks/${webhookId}`,
            resolvedConfig.baseUrl,
          )

    const payload = await requestJson(
      requestUrl,
      'Chatwoot webhook save is unavailable.',
      {
        body: {
          ...(name?.trim() ? { name: name.trim() } : {}),
          subscriptions: normalizedSubscriptions,
          url: normalizedUrl,
        },
        method: webhookId === null ? 'POST' : 'PATCH',
      },
    )

    return mapAccountWebhook(
      parseAccountWebhookResponse(payload).payload.webhook,
    )
  }

  async function fetchConversationMessages({
    beforeMessageId,
    conversationId,
  }: {
    beforeMessageId?: number | null
    conversationId: number
  }) {
    const resolvedConfig = assertConfigured()
    const requestUrl = new URL(
      `/api/v1/accounts/${resolvedConfig.accountId}/conversations/${conversationId}/messages`,
      resolvedConfig.baseUrl,
    )

    requestUrl.searchParams.set('filter_internal_messages', 'true')

    if (beforeMessageId !== undefined && beforeMessageId !== null) {
      requestUrl.searchParams.set('before', String(beforeMessageId))
    }

    const request = await fetchChatwoot(
      requestUrl,
      'Chatwoot messages lookup is unavailable.',
      {
        headers: {
          Accept: 'application/json',
          api_access_token: resolvedConfig.apiAccessToken,
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
          `Chatwoot messages lookup failed with status ${response.status}.`,
        )
      }

      const payload = await readChatwootJson({
        invalidJsonMessage: 'Chatwoot messages lookup returned invalid JSON.',
        request,
        unavailableMessage: 'Chatwoot messages lookup is unavailable.',
      })

      return sortMessages(
        parseMessagesResponse(payload).payload.map((message) =>
          mapMessage(message, {
            baseUrl: resolvedConfig.baseUrl,
          }),
        ),
      )
    } finally {
      request.clearTimeout()
    }
  }

  function createAttachmentBlob(attachment: ChatwootAttachmentUpload) {
    const data = attachment.data.slice()

    return new Blob([data], {
      type: attachment.mimeType,
    })
  }

  async function requestConversationMessageCreate({
    content,
    conversationId,
    replyToMessageId = null,
    sourceId,
  }: {
    content: string
    conversationId: number
    replyToMessageId?: number | null
    sourceId: string | null
  }) {
    const resolvedConfig = assertConfigured()
    const requestUrl = new URL(
      `/api/v1/accounts/${resolvedConfig.accountId}/conversations/${conversationId}/messages`,
      resolvedConfig.baseUrl,
    )

    const request = await fetchChatwoot(
      requestUrl,
      'Chatwoot message send is unavailable.',
      {
        body: JSON.stringify({
          content,
          content_attributes: replyToMessageId
            ? { in_reply_to: replyToMessageId }
            : {},
          content_type: 'text',
          message_type: 'incoming',
          private: false,
          ...(sourceId ? { source_id: sourceId } : {}),
        }),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          api_access_token: resolvedConfig.apiAccessToken,
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
          `Chatwoot message send failed with status ${response.status}.`,
        )
      }

      const payload = await readChatwootJson({
        invalidJsonMessage: 'Chatwoot message send returned invalid JSON.',
        request,
        unavailableMessage: 'Chatwoot message send is unavailable.',
      })

      try {
        return mapMessage(payload, {
          baseUrl: resolvedConfig.baseUrl,
        })
      } catch (error) {
        if (error instanceof ChatwootClientRequestError) {
          throw error
        }

        throw new ChatwootClientRequestError(
          'Chatwoot message send returned invalid JSON.',
        )
      }
    } finally {
      request.clearTimeout()
    }
  }

  async function requestConversationAttachmentMessageCreate({
    attachment,
    content = null,
    conversationId,
    replyToMessageId = null,
    sourceId,
  }: {
    attachment: ChatwootAttachmentUpload
    content?: string | null
    conversationId: number
    replyToMessageId?: number | null
    sourceId: string | null
  }) {
    const resolvedConfig = assertConfigured()
    const requestUrl = new URL(
      `/api/v1/accounts/${resolvedConfig.accountId}/conversations/${conversationId}/messages`,
      resolvedConfig.baseUrl,
    )
    const formData = new FormData()

    formData.append('content', content ?? '')
    formData.append(
      'content_attributes',
      JSON.stringify(replyToMessageId ? { in_reply_to: replyToMessageId } : {}),
    )
    formData.append('content_type', 'text')
    formData.append('message_type', 'incoming')
    formData.append('private', 'false')

    if (sourceId) {
      formData.append('source_id', sourceId)
    }

    formData.append(
      'attachments[]',
      createAttachmentBlob(attachment),
      attachment.fileName,
    )

    const request = await fetchChatwoot(
      requestUrl,
      'Chatwoot attachment send is unavailable.',
      {
        body: formData,
        headers: {
          Accept: 'application/json',
          api_access_token: resolvedConfig.apiAccessToken,
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
          `Chatwoot attachment send failed with status ${response.status}.`,
        )
      }

      const payload = await readChatwootJson({
        invalidJsonMessage: 'Chatwoot attachment send returned invalid JSON.',
        request,
        unavailableMessage: 'Chatwoot attachment send is unavailable.',
      })

      try {
        return mapMessage(payload, {
          baseUrl: resolvedConfig.baseUrl,
        })
      } catch (error) {
        if (error instanceof ChatwootClientRequestError) {
          throw error
        }

        throw new ChatwootClientRequestError(
          'Chatwoot attachment send returned invalid JSON.',
        )
      }
    } finally {
      request.clearTimeout()
    }
  }

  async function isConversationMessageAnchorValid(
    conversationId: number,
    beforeMessageId: number,
  ) {
    const probeMessages = await fetchConversationMessages({
      beforeMessageId: beforeMessageId + 1,
      conversationId,
    })

    if (probeMessages === null) {
      return null
    }

    return probeMessages.some((message) => message.id === beforeMessageId)
  }

  async function hasConversationMessagesBefore(
    conversationId: number,
    beforeMessageId: number,
  ) {
    const olderMessages = await fetchConversationMessages({
      beforeMessageId,
      conversationId,
    })

    if (olderMessages === null) {
      return null
    }

    return olderMessages.length > 0
  }

  return {
    async listAccountWebhooks() {
      const resolvedConfig = assertConfigured()
      const requestUrl = new URL(
        `/api/v1/accounts/${resolvedConfig.accountId}/webhooks`,
        resolvedConfig.baseUrl,
      )
      const payload = await requestJson(
        requestUrl,
        'Chatwoot webhooks lookup is unavailable.',
      )

      return parseAccountWebhooksResponse(payload).payload.webhooks.map(
        mapAccountWebhook,
      )
    },

    async createAccountWebhook({
      name = null,
      subscriptions,
      url,
    }: {
      name?: string | null
      subscriptions: string[]
      url: string
    }) {
      return saveAccountWebhook({
        name,
        subscriptions,
        url,
      })
    },

    async updateAccountWebhook({
      name = null,
      subscriptions,
      url,
      webhookId,
    }: {
      name?: string | null
      subscriptions: string[]
      url: string
      webhookId: number
    }) {
      if (!Number.isInteger(webhookId) || webhookId <= 0) {
        throw new ChatwootClientRequestError(
          'Chatwoot webhook update requires a positive webhook id.',
        )
      }

      return saveAccountWebhook({
        name,
        subscriptions,
        url,
        webhookId,
      })
    },

    async configurePortalInboxWebhook({
      url,
    }: {
      url: string
    }): Promise<ChatwootPortalInboxWebhook> {
      const resolvedConfig = assertConfigured()
      const normalizedUrl = normalizeWebhookUrl(url)
      const currentRouting = await getPortalInboxRouting()

      if (
        currentRouting.id !== resolvedConfig.portalInboxId ||
        currentRouting.channelType !== PORTAL_CONVERSATION_CHANNEL_TYPE
      ) {
        throw new ChatwootClientRequestError(
          'Configured Chatwoot portal inbox is not a Channel::Api inbox.',
        )
      }

      const requestUrl = new URL(
        `/api/v1/accounts/${resolvedConfig.accountId}/inboxes/${resolvedConfig.portalInboxId}`,
        resolvedConfig.baseUrl,
      )
      const payload = await requestJson(
        requestUrl,
        'Chatwoot portal inbox webhook update is unavailable.',
        {
          body: {
            channel: {
              webhook_url: normalizedUrl,
            },
          },
          method: 'PATCH',
        },
      )
      const updatedRouting = mapPortalInboxRouting(payload)

      if (
        updatedRouting.id !== resolvedConfig.portalInboxId ||
        updatedRouting.channelType !== PORTAL_CONVERSATION_CHANNEL_TYPE
      ) {
        throw new ChatwootClientRequestError(
          'Chatwoot portal inbox webhook update returned an invalid inbox.',
        )
      }

      if (updatedRouting.webhookUrl !== normalizedUrl) {
        throw new ChatwootClientRequestError(
          'Chatwoot portal inbox webhook update did not persist the callback URL.',
        )
      }

      return {
        id: updatedRouting.id,
        secret: updatedRouting.webhookSecret,
        url: updatedRouting.webhookUrl,
      }
    },

    async verifyPortalInboxConnection() {
      const resolvedConfig = assertConfigured()
      const currentRouting = await getPortalInboxRouting()

      if (
        currentRouting.id !== resolvedConfig.portalInboxId ||
        currentRouting.channelType !== PORTAL_CONVERSATION_CHANNEL_TYPE
      ) {
        throw new ChatwootClientRequestError(
          'Configured Chatwoot portal inbox is not a Channel::Api inbox.',
        )
      }

      return currentRouting
    },

    async ensurePortalInboxSingleConversationRouting() {
      const resolvedConfig = assertConfigured()
      const currentRouting = await getPortalInboxRouting()

      if (
        currentRouting.id !== resolvedConfig.portalInboxId ||
        currentRouting.channelType !== PORTAL_CONVERSATION_CHANNEL_TYPE
      ) {
        throw new ChatwootClientRequestError(
          'Configured Chatwoot portal inbox is not a Channel::Api inbox.',
        )
      }

      if (currentRouting.lockToSingleConversation) {
        return {
          ...currentRouting,
          updated: false,
        }
      }

      const requestUrl = new URL(
        `/api/v1/accounts/${resolvedConfig.accountId}/inboxes/${resolvedConfig.portalInboxId}`,
        resolvedConfig.baseUrl,
      )
      const payload = await requestJson(
        requestUrl,
        'Chatwoot portal inbox routing update is unavailable.',
        {
          body: {
            lock_to_single_conversation: true,
          },
          method: 'PATCH',
        },
      )
      const updatedRouting = mapPortalInboxRouting(payload)

      if (!updatedRouting.lockToSingleConversation) {
        throw new ChatwootClientRequestError(
          'Chatwoot portal inbox routing update did not enable single-conversation mode.',
        )
      }

      return {
        ...updatedRouting,
        updated: true,
      }
    },

    async findContactByEmail(email: string): Promise<ChatwootContact | null> {
      const resolvedConfig = assertConfigured()

      const normalizedEmail = normalizeEmail(email)
      const requestUrl = new URL(
        `/api/v1/accounts/${resolvedConfig.accountId}/contacts/search`,
        resolvedConfig.baseUrl,
      )

      requestUrl.searchParams.set('q', normalizedEmail)

      const payload = (await requestJson(
        requestUrl,
        'Chatwoot contact search is unavailable.',
      )) as ChatwootContactSearchResponse

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

    async listContactConversations(contactId: number) {
      const resolvedConfig = assertConfigured()

      if (!Number.isInteger(contactId) || contactId <= 0) {
        throw new ChatwootClientRequestError(
          'Chatwoot contact conversations lookup requires a valid contact id.',
        )
      }

      const requestUrl = new URL(
        `/api/v1/accounts/${resolvedConfig.accountId}/contacts/${contactId}/conversations`,
        resolvedConfig.baseUrl,
      )
      const payload = await requestJson(
        requestUrl,
        'Chatwoot contact conversations lookup is unavailable.',
      )

      const contactConversations =
        parseContactConversationsResponse(payload).payload.map(mapConversation)
      const conversationsById = new Map(
        contactConversations.map((conversation) => [
          conversation.id,
          conversation,
        ]),
      )

      if (contactConversations.length >= CONTACT_CONVERSATIONS_PAGE_LIMIT) {
        const contact = await fetchContactDetails(contactId)
        const sourceIds = collectPortalContactSourceIds(
          contact,
          resolvedConfig.portalInboxId,
        )

        for (const sourceId of sourceIds) {
          const sourceConversations =
            await fetchAllAccountConversationsBySourceId(sourceId)

          for (const conversation of sourceConversations) {
            conversationsById.set(conversation.id, conversation)
          }
        }
      }

      return [...conversationsById.values()].filter((conversation) =>
        isPortalConversation(conversation, resolvedConfig.portalInboxId),
      )
    },

    async createContactInbox({
      contactId,
      sourceId,
    }: {
      contactId: number
      sourceId: string
    }): Promise<ChatwootContactInbox> {
      const resolvedConfig = assertConfigured()

      if (!Number.isInteger(contactId) || contactId <= 0) {
        throw new ChatwootClientRequestError(
          'Chatwoot contact inbox create requires a valid contact id.',
        )
      }

      if (!sourceId.trim()) {
        throw new ChatwootClientRequestError(
          'Chatwoot contact inbox create requires a source id.',
        )
      }

      const requestUrl = new URL(
        `/api/v1/accounts/${resolvedConfig.accountId}/contacts/${contactId}/contact_inboxes`,
        resolvedConfig.baseUrl,
      )
      const payload = await requestJson(
        requestUrl,
        'Chatwoot contact inbox create is unavailable.',
        {
          body: {
            inbox_id: resolvedConfig.portalInboxId,
            source_id: sourceId.trim(),
          },
          method: 'POST',
        },
      )

      return mapContactInbox(payload)
    },

    async createConversation({
      contactId,
      sourceId,
    }: {
      contactId: number
      sourceId: string
    }): Promise<ChatwootConversation> {
      const resolvedConfig = assertConfigured()

      if (!Number.isInteger(contactId) || contactId <= 0) {
        throw new ChatwootClientRequestError(
          'Chatwoot conversation create requires a valid contact id.',
        )
      }

      if (!sourceId.trim()) {
        throw new ChatwootClientRequestError(
          'Chatwoot conversation create requires a source id.',
        )
      }

      const requestUrl = new URL(
        `/api/v1/accounts/${resolvedConfig.accountId}/conversations`,
        resolvedConfig.baseUrl,
      )
      const payload = await requestJson(
        requestUrl,
        'Chatwoot conversation create is unavailable.',
        {
          body: {
            contact_id: contactId,
            inbox_id: resolvedConfig.portalInboxId,
            source_id: sourceId.trim(),
            status: 'open',
          },
          method: 'POST',
        },
      )

      if (!isPlainObject(payload)) {
        throw new ChatwootClientRequestError(
          'Chatwoot conversation create returned an unexpected response shape.',
        )
      }

      const id = readInteger(payload.id)
      const inboxId = readInteger(payload.inbox_id)

      if (id === null || inboxId === null) {
        throw new ChatwootClientRequestError(
          'Chatwoot conversation create returned an invalid conversation payload.',
        )
      }

      return {
        assigneeName: null,
        channelType: PORTAL_CONVERSATION_CHANNEL_TYPE,
        createdAt: readInteger(payload.created_at),
        id,
        inboxId,
        lastActivityAt: readInteger(payload.last_activity_at),
        status: readString(payload.status) ?? 'open',
      }
    },

    async findContactPortalInboxSourceId(contactId: number) {
      const resolvedConfig = assertConfigured()

      if (!Number.isInteger(contactId) || contactId <= 0) {
        throw new ChatwootClientRequestError(
          'Chatwoot contact lookup requires a valid contact id.',
        )
      }

      const contact = await fetchContactDetails(contactId)
      const sourceIds = collectPortalContactSourceIds(
        contact,
        resolvedConfig.portalInboxId,
      )

      return sourceIds[0] ?? null
    },

    async createConversationIncomingMessage({
      content,
      conversationId,
      replyToMessageId = null,
      sourceId = null,
    }: {
      content: string
      conversationId: number
      replyToMessageId?: number | null
      sourceId?: string | null
    }) {
      assertConfigured()

      if (!Number.isInteger(conversationId) || conversationId <= 0) {
        throw new ChatwootClientRequestError(
          'Chatwoot message send requires a valid conversation id.',
        )
      }

      if (!content.trim()) {
        throw new ChatwootClientRequestError(
          'Chatwoot message send requires non-empty content.',
        )
      }

      if (
        replyToMessageId !== null &&
        (!Number.isInteger(replyToMessageId) || replyToMessageId <= 0)
      ) {
        throw new ChatwootClientRequestError(
          'Chatwoot message send requires a valid reply target id.',
        )
      }

      return requestConversationMessageCreate({
        content: content.trim(),
        conversationId,
        replyToMessageId,
        sourceId: sourceId?.trim() || null,
      })
    },

    async createConversationIncomingAttachmentMessage({
      attachment,
      content = null,
      conversationId,
      replyToMessageId = null,
      sourceId = null,
    }: {
      attachment: ChatwootAttachmentUpload
      content?: string | null
      conversationId: number
      replyToMessageId?: number | null
      sourceId?: string | null
    }) {
      assertConfigured()

      if (!Number.isInteger(conversationId) || conversationId <= 0) {
        throw new ChatwootClientRequestError(
          'Chatwoot attachment send requires a valid conversation id.',
        )
      }

      if (!attachment.fileName.trim()) {
        throw new ChatwootClientRequestError(
          'Chatwoot attachment send requires a file name.',
        )
      }

      if (!attachment.mimeType.trim()) {
        throw new ChatwootClientRequestError(
          'Chatwoot attachment send requires a file type.',
        )
      }

      if (attachment.data.byteLength <= 0) {
        throw new ChatwootClientRequestError(
          'Chatwoot attachment send requires file data.',
        )
      }

      const normalizedContent = content?.trim() || null

      if (
        replyToMessageId !== null &&
        (!Number.isInteger(replyToMessageId) || replyToMessageId <= 0)
      ) {
        throw new ChatwootClientRequestError(
          'Chatwoot attachment send requires a valid reply target id.',
        )
      }

      return requestConversationAttachmentMessageCreate({
        attachment: {
          data: attachment.data,
          fileName: attachment.fileName.trim(),
          mimeType: attachment.mimeType.trim().toLowerCase(),
        },
        content: normalizedContent,
        conversationId,
        replyToMessageId,
        sourceId: sourceId?.trim() || null,
      })
    },

    async findConversationMessageById(
      conversationId: number,
      messageId: number,
    ) {
      assertConfigured()

      if (!Number.isInteger(messageId) || messageId <= 0) {
        throw new ChatwootClientRequestError(
          'Chatwoot message lookup requires a valid message id.',
        )
      }

      const messages = await fetchConversationMessages({
        beforeMessageId: messageId + 1,
        conversationId,
      })

      return messages?.find((message) => message.id === messageId) ?? null
    },

    async findConversationMessageBySourceId(
      conversationId: number,
      sourceId: string,
    ) {
      assertConfigured()

      if (!sourceId.trim()) {
        return null
      }

      const messages = await fetchConversationMessages({
        conversationId,
      })

      return (
        messages?.find((message) => message.sourceId === sourceId.trim()) ??
        null
      )
    },

    async listConversationMessages(
      conversationId: number,
      { beforeMessageId = null }: { beforeMessageId?: number | null } = {},
    ): Promise<ChatwootMessagesPage | null> {
      assertConfigured()

      if (!Number.isInteger(conversationId) || conversationId <= 0) {
        throw new ChatwootClientRequestError(
          'Chatwoot messages lookup requires a valid conversation id.',
        )
      }

      if (
        beforeMessageId !== null &&
        (!Number.isInteger(beforeMessageId) || beforeMessageId <= 0)
      ) {
        throw new ChatwootInvalidHistoryCursorError()
      }

      if (beforeMessageId !== null) {
        const isAnchorValid = await isConversationMessageAnchorValid(
          conversationId,
          beforeMessageId,
        )

        if (isAnchorValid === null) {
          return null
        }

        if (!isAnchorValid) {
          throw new ChatwootInvalidHistoryCursorError()
        }
      }

      const messages = await fetchConversationMessages({
        beforeMessageId,
        conversationId,
      })

      if (messages === null) {
        return null
      }

      const page = buildMessagesPage(messages)

      if (page.length === 0) {
        return {
          hasMoreOlder: false,
          messages: [],
          nextOlderCursor: null,
        }
      }

      const oldestMessage = page[0]

      if (!oldestMessage) {
        return {
          hasMoreOlder: false,
          messages: page,
          nextOlderCursor: null,
        }
      }

      if (page.length < MESSAGE_PAGE_SIZE) {
        return {
          hasMoreOlder: false,
          messages: page,
          nextOlderCursor: null,
        }
      }

      const hasMoreOlder = await hasConversationMessagesBefore(
        conversationId,
        oldestMessage.id,
      )

      if (hasMoreOlder === null) {
        return null
      }

      return {
        hasMoreOlder,
        messages: page,
        nextOlderCursor: hasMoreOlder ? oldestMessage.id : null,
      }
    },
  }
}

export type ChatwootClient = ReturnType<typeof createChatwootClient>

export function createChatwootClientFactory({
  fetchFn = fetch,
  requestTimeoutMs,
}: CreateChatwootClientFactoryOptions = {}) {
  return {
    forTenant(config: ChatwootClientConfig) {
      return createChatwootClient({
        config,
        fetchFn,
        requestTimeoutMs,
      })
    },
  }
}

export type ChatwootClientFactory = ReturnType<
  typeof createChatwootClientFactory
>
