import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, it } from 'vitest'

const serviceWorkerSource = readFileSync(
  resolve(process.cwd(), 'public/sw.js'),
  'utf8',
)

it('keeps the service worker text outbox classifier explicit', () => {
  expect(serviceWorkerSource).toContain(
    'function isPermanentTextOutboxSendError',
  )
  expect(serviceWorkerSource).toContain('function classifyTextOutboxSendError')

  for (const code of [
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
  ]) {
    expect(serviceWorkerSource).toContain(`'${code}'`)
  }

  for (const code of [
    'CHAT_SEND_RATE_LIMITED',
    'chat_send_in_progress',
    'chat_send_ledger_unavailable',
    'chat_send_unavailable',
  ]) {
    expect(serviceWorkerSource).toContain(`'${code}'`)
  }
})
