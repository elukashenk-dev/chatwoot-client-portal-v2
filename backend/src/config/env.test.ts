import { describe, expect, it } from 'vitest'

import { loadEnv } from './env.js'

const baseRawEnv = {
  DATABASE_URL:
    'postgres://test:test@127.0.0.1:5432/chatwoot_client_portal_v2_test',
  SESSION_SECRET: 'test-session-secret-with-at-least-thirty-two-characters',
} satisfies NodeJS.ProcessEnv

describe('loadEnv', () => {
  it('leaves Chatwoot request timeout unset by default', () => {
    expect(loadEnv(baseRawEnv).CHATWOOT_REQUEST_TIMEOUT_MS).toBeUndefined()
  })

  it('parses configured Chatwoot request timeout as a positive integer', () => {
    expect(
      loadEnv({
        ...baseRawEnv,
        CHATWOOT_REQUEST_TIMEOUT_MS: '30000',
      }).CHATWOOT_REQUEST_TIMEOUT_MS,
    ).toBe(30_000)
  })

  it('rejects invalid Chatwoot request timeout values', () => {
    expect(() =>
      loadEnv({
        ...baseRawEnv,
        CHATWOOT_REQUEST_TIMEOUT_MS: '0',
      }),
    ).toThrow(/CHATWOOT_REQUEST_TIMEOUT_MS/)
  })
})
