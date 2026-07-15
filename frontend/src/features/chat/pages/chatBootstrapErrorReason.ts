import { ChatApiClientError } from '../api/chatClient'
import type { ChatThreadReason } from '../types'

const CONTACT_CONFIGURATION_ERROR_CODES = new Set([
  'portal_client_group_contact_ids_invalid',
  'portal_contact_disabled',
  'portal_contact_missing',
  'portal_group_contact_disabled',
  'portal_group_flag_required',
  'portal_is_group_invalid',
  'portal_person_contact_expected',
])

export function getChatBootstrapErrorReason(error: unknown): ChatThreadReason {
  if (
    error instanceof ChatApiClientError &&
    error.code !== undefined &&
    CONTACT_CONFIGURATION_ERROR_CODES.has(error.code)
  ) {
    return 'contact_configuration_invalid'
  }

  return 'chatwoot_unavailable'
}
