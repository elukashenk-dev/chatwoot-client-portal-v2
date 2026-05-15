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

  it('keeps conservative auth rate limit defaults', () => {
    const env = loadEnv(baseRawEnv)

    expect(env.AUTH_RATE_LIMIT_MAX).toBe(5)
    expect(env.AUTH_RATE_LIMIT_WINDOW_MS).toBe(60_000)
  })

  it('parses configured auth rate limits as positive integers', () => {
    const env = loadEnv({
      ...baseRawEnv,
      AUTH_RATE_LIMIT_MAX: '100',
      AUTH_RATE_LIMIT_WINDOW_MS: '1000',
    })

    expect(env.AUTH_RATE_LIMIT_MAX).toBe(100)
    expect(env.AUTH_RATE_LIMIT_WINDOW_MS).toBe(1000)
  })

  it('rejects invalid auth rate limit values', () => {
    expect(() =>
      loadEnv({
        ...baseRawEnv,
        AUTH_RATE_LIMIT_MAX: '0',
      }),
    ).toThrow(/AUTH_RATE_LIMIT_MAX/)
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
