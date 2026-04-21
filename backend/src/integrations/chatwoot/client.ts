import type { AppEnv } from '../../config/env.js'
import { normalizeEmail } from '../../lib/email.js'

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
}

export type ChatwootMessageAttachment = {
  extension: string | null
  fileSize: number | null
  fileType: string
  id: number
  messageId: number
  name: string
  thumbUrl: string
  url: string
}

export type ChatwootMessage = {
  attachments: ChatwootMessageAttachment[]
  content: string | null
  contentAttributes: Record<string, unknown>
  contentType: string
  createdAt: number
  id: number
  messageType: number
  private: boolean
  sender: {
    id: number | null
    name: string | null
    type: string | null
  } | null
  sourceId: string | null
  status: string
}

export type ChatwootMessagesPage = {
  hasMoreOlder: boolean
  messages: ChatwootMessage[]
  nextOlderCursor: number | null
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

export class ChatwootInvalidHistoryCursorError extends Error {
  constructor(
    message = 'History cursor is invalid for the current conversation.',
  ) {
    super(message)

    this.name = 'ChatwootInvalidHistoryCursorError'
  }
}

type CreateChatwootClientOptions = {
  env: Pick<
    AppEnv,
    | 'CHATWOOT_ACCOUNT_ID'
    | 'CHATWOOT_API_ACCESS_TOKEN'
    | 'CHATWOOT_BASE_URL'
    | 'CHATWOOT_PORTAL_INBOX_ID'
  >
  fetchFn?: typeof fetch
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

function extractAttachmentNameFromUrl(url: string) {
  if (!url.trim()) {
    return null
  }

  try {
    const parsedUrl = new URL(url)
    const rawSegment = parsedUrl.pathname.split('/').pop()

    return rawSegment ? decodeURIComponent(rawSegment) : null
  } catch {
    return null
  }
}

function buildAttachmentName(payload: Record<string, unknown>) {
  const fallbackTitle = readString(payload.fallback_title)?.trim()

  if (fallbackTitle) {
    return fallbackTitle
  }

  const dataUrl = readString(payload.data_url) ?? ''
  const urlName = extractAttachmentNameFromUrl(dataUrl)

  if (urlName) {
    return urlName
  }

  const extension = readString(payload.extension)?.trim().replace(/^\./, '')

  if (extension) {
    return `attachment.${extension}`
  }

  return readString(payload.file_type) === 'image'
    ? 'image-attachment'
    : 'attached-file'
}

function mapAttachment(payload: unknown): ChatwootMessageAttachment {
  if (!isPlainObject(payload)) {
    throw new ChatwootClientRequestError(
      'Chatwoot messages lookup returned an invalid attachment payload.',
    )
  }

  const id = readInteger(payload.id)
  const messageId = readInteger(payload.message_id)
  const fileType = readString(payload.file_type)

  if (id === null || messageId === null || !fileType) {
    throw new ChatwootClientRequestError(
      'Chatwoot messages lookup returned an invalid attachment payload.',
    )
  }

  return {
    extension: readString(payload.extension),
    fileSize: readInteger(payload.file_size),
    fileType,
    id,
    messageId,
    name: buildAttachmentName(payload),
    thumbUrl: readString(payload.thumb_url) ?? '',
    url: readString(payload.data_url) ?? '',
  }
}

function mapSender(payload: unknown, defaultType: string | null) {
  if (!isPlainObject(payload)) {
    return null
  }

  const id = readInteger(payload.id) ?? readInteger(payload.sender_id)
  const name = readString(payload.name)
  const type =
    readString(payload.type) ?? readString(payload.sender_type) ?? defaultType

  if (id === null && name === null && type === null) {
    return null
  }

  return {
    id,
    name,
    type,
  }
}

function mapMessage(payload: unknown): ChatwootMessage {
  if (!isPlainObject(payload)) {
    throw new ChatwootClientRequestError(
      'Chatwoot messages lookup returned an invalid message payload.',
    )
  }

  const id = readInteger(payload.id)
  const messageType = readInteger(payload.message_type)
  const createdAt = readInteger(payload.created_at)
  const contentType = readString(payload.content_type)
  const status = readString(payload.status)
  const isPrivate =
    typeof payload.private === 'boolean' ? payload.private : null

  if (
    id === null ||
    messageType === null ||
    createdAt === null ||
    !contentType ||
    !status ||
    isPrivate === null
  ) {
    throw new ChatwootClientRequestError(
      'Chatwoot messages lookup returned an invalid message payload.',
    )
  }

  return {
    attachments: Array.isArray(payload.attachments)
      ? payload.attachments.map(mapAttachment)
      : [],
    content: readString(payload.content),
    contentAttributes: readObject(payload.content_attributes) ?? {},
    contentType,
    createdAt,
    id,
    messageType,
    private: isPrivate,
    sender: mapSender(payload.sender, messageType === 0 ? 'contact' : null),
    sourceId: readString(payload.source_id),
    status,
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
          portalInboxId: env.CHATWOOT_PORTAL_INBOX_ID,
        }
      : null

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
      method?: 'GET' | 'PATCH'
    } = {},
  ): Promise<unknown> {
    const resolvedConfig = assertConfigured()
    let response: Response

    try {
      response = await fetchFn(requestUrl, {
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          api_access_token: resolvedConfig.apiAccessToken,
        },
        method,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      })
    } catch {
      throw new ChatwootClientRequestError(unavailableMessage)
    }

    if (!response.ok) {
      throw new ChatwootClientRequestError(
        `${unavailableMessage} Status: ${response.status}.`,
      )
    }

    try {
      return await response.json()
    } catch {
      throw new ChatwootClientRequestError(
        'Chatwoot returned an invalid JSON response.',
      )
    }
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

    let response: Response

    try {
      response = await fetchFn(requestUrl, {
        headers: {
          Accept: 'application/json',
          api_access_token: resolvedConfig.apiAccessToken,
        },
        method: 'GET',
      })
    } catch {
      throw new ChatwootClientRequestError(
        'Chatwoot messages lookup is unavailable.',
      )
    }

    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      throw new ChatwootClientRequestError(
        `Chatwoot messages lookup failed with status ${response.status}.`,
      )
    }

    let payload: unknown

    try {
      payload = await response.json()
    } catch {
      throw new ChatwootClientRequestError(
        'Chatwoot messages lookup returned invalid JSON.',
      )
    }

    return sortMessages(parseMessagesResponse(payload).payload.map(mapMessage))
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
      if (!config) {
        throw new ChatwootClientConfigurationError()
      }

      const normalizedEmail = normalizeEmail(email)
      const requestUrl = new URL(
        `/api/v1/accounts/${config.accountId}/contacts/search`,
        config.baseUrl,
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
