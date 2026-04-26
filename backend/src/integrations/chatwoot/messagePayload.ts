import { ChatwootClientRequestError } from './errors.js'

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
    avatarUrl?: string | null
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

function resolveChatwootAssetUrl(value: string | null, baseUrl: string | null) {
  const trimmedValue = value?.trim()

  if (!trimmedValue) {
    return null
  }

  try {
    return new URL(trimmedValue, baseUrl ?? undefined).href
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

function mapSender(
  payload: unknown,
  {
    baseUrl = null,
    defaultType,
  }: {
    baseUrl?: string | null
    defaultType: string | null
  },
) {
  if (!isPlainObject(payload)) {
    return null
  }

  const avatarUrl = resolveChatwootAssetUrl(
    readString(payload.avatar_url) ?? readString(payload.thumbnail),
    baseUrl,
  )
  const id = readInteger(payload.id) ?? readInteger(payload.sender_id)
  const name = readString(payload.name)
  const type =
    readString(payload.type) ?? readString(payload.sender_type) ?? defaultType

  if (avatarUrl === null && id === null && name === null && type === null) {
    return null
  }

  return {
    avatarUrl,
    id,
    name,
    type,
  }
}

export function mapMessage(
  payload: unknown,
  {
    baseUrl = null,
  }: {
    baseUrl?: string | null
  } = {},
): ChatwootMessage {
  if (!isPlainObject(payload)) {
    throw new ChatwootClientRequestError(
      'Chatwoot messages lookup returned an invalid message payload.',
    )
  }

  const id = readInteger(payload.id)
  const messageType = readInteger(payload.message_type)
  const createdAt = readInteger(payload.created_at)
  const contentType = readString(payload.content_type) ?? 'text'
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
    sender: mapSender(payload.sender, {
      baseUrl,
      defaultType: messageType === 0 ? 'contact' : null,
    }),
    sourceId: readString(payload.source_id),
    status,
  }
}
