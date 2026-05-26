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

  it('leaves attachment proxy extra origins empty by default', () => {
    expect(loadEnv(baseRawEnv).CHAT_ATTACHMENT_PROXY_ALLOWED_ORIGINS).toEqual(
      [],
    )
  })

  it('parses configured attachment proxy extra origins', () => {
    expect(
      loadEnv({
        ...baseRawEnv,
        CHAT_ATTACHMENT_PROXY_ALLOWED_ORIGINS:
          'https://storage.example.test, https://cdn.example.test/path',
      }).CHAT_ATTACHMENT_PROXY_ALLOWED_ORIGINS,
    ).toEqual(['https://storage.example.test', 'https://cdn.example.test/path'])
  })

  it('rejects invalid attachment proxy extra origins', () => {
    expect(() =>
      loadEnv({
        ...baseRawEnv,
        CHAT_ATTACHMENT_PROXY_ALLOWED_ORIGINS:
          'https://storage.example.test,not-a-url',
      }),
    ).toThrow(/CHAT_ATTACHMENT_PROXY_ALLOWED_ORIGINS/)
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

  it('leaves Web Push VAPID configuration unset by default', () => {
    const env = loadEnv(baseRawEnv)

    expect(env.PUSH_VAPID_PUBLIC_KEY).toBeUndefined()
    expect(env.PUSH_VAPID_PRIVATE_KEY).toBeUndefined()
    expect(env.PUSH_VAPID_SUBJECT).toBeUndefined()
    expect(env.PUSH_VAPID_KEY_ID).toBeUndefined()
  })

  it('uses conservative default Web Push subscription origins', () => {
    expect(loadEnv(baseRawEnv).PUSH_SUBSCRIPTION_ALLOWED_ORIGINS).toEqual([
      'https://fcm.googleapis.com',
      'https://updates.push.services.mozilla.com',
      'https://web.push.apple.com',
    ])
  })

  it('parses configured Web Push subscription origins', () => {
    expect(
      loadEnv({
        ...baseRawEnv,
        PUSH_SUBSCRIPTION_ALLOWED_ORIGINS:
          'https://push.example.test, https://another-push.example.test',
      }).PUSH_SUBSCRIPTION_ALLOWED_ORIGINS,
    ).toEqual([
      'https://push.example.test',
      'https://another-push.example.test',
    ])
  })

  it('accepts a complete Web Push VAPID configuration', () => {
    const env = loadEnv({
      ...baseRawEnv,
      PUSH_VAPID_PUBLIC_KEY: 'public-key',
      PUSH_VAPID_PRIVATE_KEY: 'private-key',
      PUSH_VAPID_SUBJECT: 'mailto:support@example.test',
      PUSH_VAPID_KEY_ID: 'vapid-key-2026-05',
    })

    expect(env.PUSH_VAPID_PUBLIC_KEY).toBe('public-key')
    expect(env.PUSH_VAPID_PRIVATE_KEY).toBe('private-key')
    expect(env.PUSH_VAPID_SUBJECT).toBe('mailto:support@example.test')
    expect(env.PUSH_VAPID_KEY_ID).toBe('vapid-key-2026-05')
  })

  it('allows a Web Push subject without keys and keeps push unavailable', () => {
    const env = loadEnv({
      ...baseRawEnv,
      PUSH_VAPID_SUBJECT: 'mailto:support@example.test',
    })

    expect(env.PUSH_VAPID_PUBLIC_KEY).toBeUndefined()
    expect(env.PUSH_VAPID_PRIVATE_KEY).toBeUndefined()
    expect(env.PUSH_VAPID_SUBJECT).toBe('mailto:support@example.test')
  })

  it('rejects a Web Push public key without a private key', () => {
    expect(() =>
      loadEnv({
        ...baseRawEnv,
        PUSH_VAPID_PUBLIC_KEY: 'public-key',
        PUSH_VAPID_SUBJECT: 'mailto:support@example.test',
      }),
    ).toThrow(/PUSH_VAPID_PUBLIC_KEY/)
  })

  it('rejects a Web Push private key without a public key', () => {
    expect(() =>
      loadEnv({
        ...baseRawEnv,
        PUSH_VAPID_PRIVATE_KEY: 'private-key',
        PUSH_VAPID_SUBJECT: 'mailto:support@example.test',
      }),
    ).toThrow(/PUSH_VAPID_PUBLIC_KEY/)
  })

  it('rejects Web Push VAPID keys without a subject', () => {
    expect(() =>
      loadEnv({
        ...baseRawEnv,
        PUSH_VAPID_PUBLIC_KEY: 'public-key',
        PUSH_VAPID_PRIVATE_KEY: 'private-key',
      }),
    ).toThrow(/PUSH_VAPID_SUBJECT/)
  })
})
