import { expect, it } from 'vitest'

import { classifyTextOutboxSendError } from './outboxErrorClassification'

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
  'thread_access_denied',
])('classifies permanent text outbox error code %s', (code) => {
  expect(
    classifyTextOutboxSendError({
      code,
      statusCode: 409,
    }),
  ).toBe('permanent')
})

it.each([
  'CHAT_SEND_RATE_LIMITED',
  'chat_send_in_progress',
  'chat_send_ledger_unavailable',
  'chat_send_unavailable',
])('classifies temporary text outbox error code %s', (code) => {
  expect(
    classifyTextOutboxSendError({
      code,
      statusCode: 409,
    }),
  ).toBe('temporary')
})

it.each([null, 0, 408, 429, 500, 503])(
  'classifies retryable transport status %s as temporary',
  (statusCode) => {
    expect(
      classifyTextOutboxSendError({
        code: null,
        statusCode,
      }),
    ).toBe('temporary')
  },
)

it.each([400, 403])(
  'classifies validation/access status %s as permanent',
  (statusCode) => {
    expect(
      classifyTextOutboxSendError({
        code: null,
        statusCode,
      }),
    ).toBe('permanent')
  },
)

it('classifies 401 as auth instead of a normal retry or failed message', () => {
  expect(
    classifyTextOutboxSendError({
      code: 'unauthorized',
      statusCode: 401,
    }),
  ).toBe('auth')
})

it('defaults unknown server decisions to permanent so outbox records do not retry forever', () => {
  expect(
    classifyTextOutboxSendError({
      code: 'unexpected_backend_rejection',
      statusCode: 409,
    }),
  ).toBe('permanent')
})
