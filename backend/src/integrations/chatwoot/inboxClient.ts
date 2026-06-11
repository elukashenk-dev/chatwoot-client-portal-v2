import { ChatwootClientRequestError } from './errors.js'

export const PORTAL_CONVERSATION_CHANNEL_TYPE = 'Channel::Api'

export type ChatwootPortalInboxRouting = {
  channelType: string | null
  id: number
  inboxIdentifier: string | null
  lockToSingleConversation: boolean
  webhookSecret: string | null
  webhookUrl: string | null
}

export type ChatwootPortalInboxWorkingHour = {
  closeHour: number | null
  closeMinutes: number | null
  closedAllDay: boolean
  dayOfWeek: number
  openAllDay: boolean
  openHour: number | null
  openMinutes: number | null
}

export type ChatwootPortalInboxDetails = ChatwootPortalInboxRouting & {
  outOfOfficeMessage: string | null
  timezone: string | null
  workingHours: ChatwootPortalInboxWorkingHour[]
  workingHoursEnabled: boolean
}

export type ChatwootPortalInboxMember = {
  availabilityStatus: string | null
  id: number
  name: string | null
}

export type ChatwootPortalInboxWebhook = {
  id: number
  inboxIdentifier: string | null
  secret: string | null
  url: string | null
}

export type ChatwootInboxSummary = {
  channelType: string | null
  id: number
  inboxIdentifier: string | null
  name: string | null
}

export type ChatwootCreatedApiInbox = ChatwootPortalInboxRouting & {
  name: string | null
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

function readBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null
}

export function mapPortalInboxRouting(
  payload: unknown,
): ChatwootPortalInboxRouting {
  if (!isPlainObject(payload)) {
    throw new ChatwootClientRequestError(
      'Chatwoot inbox lookup returned an unexpected response shape.',
    )
  }

  const id = readInteger(payload.id)
  const channelType = readString(payload.channel_type)
  const lockToSingleConversation = readBoolean(
    payload.lock_to_single_conversation,
  )

  if (id === null || lockToSingleConversation === null) {
    throw new ChatwootClientRequestError(
      'Chatwoot inbox lookup returned an invalid inbox payload.',
    )
  }

  return {
    channelType,
    id,
    inboxIdentifier: readTrimmedString(payload.inbox_identifier),
    lockToSingleConversation,
    webhookSecret: readTrimmedString(payload.secret),
    webhookUrl: readTrimmedString(payload.webhook_url),
  }
}

function mapPortalInboxWorkingHour(
  payload: unknown,
): ChatwootPortalInboxWorkingHour | null {
  if (!isPlainObject(payload)) {
    return null
  }

  const dayOfWeek = readInteger(payload.day_of_week)
  const closedAllDay = readBoolean(payload.closed_all_day)
  const openAllDay = readBoolean(payload.open_all_day)

  if (dayOfWeek === null || closedAllDay === null || openAllDay === null) {
    return null
  }

  return {
    closeHour: readInteger(payload.close_hour),
    closeMinutes: readInteger(payload.close_minutes),
    closedAllDay,
    dayOfWeek,
    openAllDay,
    openHour: readInteger(payload.open_hour),
    openMinutes: readInteger(payload.open_minutes),
  }
}

export function mapPortalInboxDetails(
  payload: unknown,
): ChatwootPortalInboxDetails {
  const routing = mapPortalInboxRouting(payload)

  if (!isPlainObject(payload)) {
    throw new ChatwootClientRequestError(
      'Chatwoot inbox lookup returned an unexpected response shape.',
    )
  }

  const workingHoursEnabled =
    typeof payload.working_hours_enabled === 'boolean'
      ? payload.working_hours_enabled
      : false
  const workingHours = Array.isArray(payload.working_hours)
    ? payload.working_hours
        .map(mapPortalInboxWorkingHour)
        .filter((row): row is ChatwootPortalInboxWorkingHour => row !== null)
    : []

  return {
    ...routing,
    outOfOfficeMessage: readTrimmedString(payload.out_of_office_message),
    timezone: readTrimmedString(payload.timezone),
    workingHours,
    workingHoursEnabled,
  }
}

function mapInboxSummary(payload: unknown): ChatwootInboxSummary {
  if (!isPlainObject(payload)) {
    throw new ChatwootClientRequestError(
      'Chatwoot inboxes lookup returned an invalid inbox payload.',
    )
  }

  const id = readInteger(payload.id)

  if (id === null) {
    throw new ChatwootClientRequestError(
      'Chatwoot inboxes lookup returned an invalid inbox payload.',
    )
  }

  return {
    channelType: readString(payload.channel_type),
    id,
    inboxIdentifier: readTrimmedString(payload.inbox_identifier),
    name: readTrimmedString(payload.name),
  }
}

export function parseInboxesResponse(payload: unknown): ChatwootInboxSummary[] {
  const parsedPayload = readObject(payload)
  const rawInboxes = parsedPayload?.payload

  if (!Array.isArray(rawInboxes)) {
    throw new ChatwootClientRequestError(
      'Chatwoot inboxes lookup returned an unexpected response shape.',
    )
  }

  return rawInboxes.map(mapInboxSummary)
}

export function mapCreatedApiInbox(payload: unknown): ChatwootCreatedApiInbox {
  if (!isPlainObject(payload)) {
    throw new ChatwootClientRequestError(
      'Chatwoot API inbox creation returned an unexpected response shape.',
    )
  }

  const routing = mapPortalInboxRouting(payload)

  if (routing.channelType !== PORTAL_CONVERSATION_CHANNEL_TYPE) {
    throw new ChatwootClientRequestError(
      'Chatwoot API inbox creation returned a non-API inbox.',
    )
  }

  if (!routing.lockToSingleConversation) {
    throw new ChatwootClientRequestError(
      'Chatwoot API inbox creation did not enable single-conversation mode.',
    )
  }

  return {
    ...routing,
    name: readTrimmedString(payload.name),
  }
}

export function parseInboxMembersResponse(payload: unknown) {
  const parsedPayload = readObject(payload)
  const rawMembers = parsedPayload?.payload

  if (!Array.isArray(rawMembers)) {
    throw new ChatwootClientRequestError(
      'Chatwoot inbox members lookup returned an unexpected response shape.',
    )
  }

  return rawMembers
    .map((rawMember): ChatwootPortalInboxMember | null => {
      const member = readObject(rawMember)
      const id = readInteger(member?.id)

      if (id === null) {
        return null
      }

      return {
        availabilityStatus: readTrimmedString(member?.availability_status),
        id,
        name: readTrimmedString(member?.name),
      }
    })
    .filter((member): member is ChatwootPortalInboxMember => member !== null)
}
