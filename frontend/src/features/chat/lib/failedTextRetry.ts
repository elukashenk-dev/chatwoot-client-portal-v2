const NON_RETRYABLE_FAILED_TEXT_SEND_ERROR_CODES = new Set([
  'INVALID_REQUEST',
  'chat_thread_unsupported',
  'client_message_key_conflict',
  'client_message_key_required',
  'client_message_key_too_long',
  'message_content_required',
  'message_content_too_long',
  'reply_target_invalid',
  'reply_target_unavailable',
])

export function canRetryFailedTextSend(errorCode?: string | null) {
  if (!errorCode) {
    return true
  }

  return !NON_RETRYABLE_FAILED_TEXT_SEND_ERROR_CODES.has(errorCode)
}
