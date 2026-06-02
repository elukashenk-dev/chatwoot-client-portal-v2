import { expect, it } from 'vitest'

import { canRetryFailedTextSend } from './failedTextRetry'

it.each([null, undefined, 'thread_access_denied'])(
  'allows retry for failed text error code %s',
  (errorCode) => {
    expect(canRetryFailedTextSend(errorCode)).toBe(true)
  },
)

it.each([
  'INVALID_REQUEST',
  'chat_thread_unsupported',
  'client_message_key_conflict',
  'client_message_key_required',
  'client_message_key_too_long',
  'message_content_required',
  'message_content_too_long',
  'reply_target_invalid',
  'reply_target_unavailable',
])('hides retry for non-retryable failed text error code %s', (errorCode) => {
  expect(canRetryFailedTextSend(errorCode)).toBe(false)
})
