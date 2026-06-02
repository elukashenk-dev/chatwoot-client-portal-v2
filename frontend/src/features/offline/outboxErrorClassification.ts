export type TextOutboxSendErrorClassification =
  | 'auth'
  | 'permanent'
  | 'temporary'

export type TextOutboxSendErrorInput = {
  code?: string | null
  statusCode?: number | null
}

const PERMANENT_TEXT_OUTBOX_SEND_ERROR_CODES = new Set([
  'INVALID_REQUEST',
  'chat_thread_unsupported',
  'client_message_key_conflict',
  'client_message_key_required',
  'client_message_key_too_long',
  'message_content_required',
  'message_content_too_long',
  'reply_target_invalid',
  'reply_target_unavailable',
  'thread_access_denied',
])

const TEMPORARY_TEXT_OUTBOX_SEND_ERROR_CODES = new Set([
  'CHAT_SEND_RATE_LIMITED',
  'chat_send_in_progress',
  'chat_send_ledger_unavailable',
  'chat_send_unavailable',
])

export function classifyTextOutboxSendError({
  code = null,
  statusCode = null,
}: TextOutboxSendErrorInput): TextOutboxSendErrorClassification {
  if (statusCode === 401) {
    return 'auth'
  }

  if (code && PERMANENT_TEXT_OUTBOX_SEND_ERROR_CODES.has(code)) {
    return 'permanent'
  }

  if (statusCode === 400 || statusCode === 403) {
    return 'permanent'
  }

  if (code && TEMPORARY_TEXT_OUTBOX_SEND_ERROR_CODES.has(code)) {
    return 'temporary'
  }

  if (
    statusCode === null ||
    statusCode === 0 ||
    statusCode === 408 ||
    statusCode === 429 ||
    statusCode >= 500
  ) {
    return 'temporary'
  }

  return 'permanent'
}

export function isPermanentTextOutboxSendError(
  error: TextOutboxSendErrorInput,
) {
  return classifyTextOutboxSendError(error) === 'permanent'
}
