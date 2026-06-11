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

  it('does not expose retired single-tenant Chatwoot runtime env values', () => {
    const env = loadEnv({
      ...baseRawEnv,
      CHATWOOT_ACCOUNT_ID: '1',
      CHATWOOT_API_ACCESS_TOKEN: 'token',
      CHATWOOT_BASE_URL: 'https://chatwoot.example.test',
      CHATWOOT_PORTAL_INBOX_ID: '2',
      CHATWOOT_WEBHOOK_CALLBACK_URL:
        'https://lk.example.test/api/integrations/chatwoot/webhooks/account',
      CHATWOOT_WEBHOOK_SECRET: 'webhook-secret',
    })

    expect('CHATWOOT_ACCOUNT_ID' in env).toBe(false)
    expect('CHATWOOT_API_ACCESS_TOKEN' in env).toBe(false)
    expect('CHATWOOT_BASE_URL' in env).toBe(false)
    expect('CHATWOOT_PORTAL_INBOX_ID' in env).toBe(false)
    expect('CHATWOOT_WEBHOOK_CALLBACK_URL' in env).toBe(false)
    expect('CHATWOOT_WEBHOOK_SECRET' in env).toBe(false)
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

  it('leaves operator provisioning configuration unset by default', () => {
    const env = loadEnv(baseRawEnv)

    expect(env.CHATWOOT_PLATFORM_API_ACCESS_TOKEN).toBeUndefined()
    expect(env.PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX).toBeUndefined()
    expect(env.PORTAL_PROVISIONING_SERVICE_EMAIL_DOMAIN).toBeUndefined()
  })

  it('parses operator provisioning configuration when set', () => {
    const env = loadEnv({
      ...baseRawEnv,
      CHATWOOT_PLATFORM_API_ACCESS_TOKEN: ' platform-token ',
      PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX: ' PORTAL.EXAMPLE.COM. ',
      PORTAL_PROVISIONING_SERVICE_EMAIL_DOMAIN: ' service.portal.example.com ',
    })

    expect(env.CHATWOOT_PLATFORM_API_ACCESS_TOKEN).toBe('platform-token')
    expect(env.PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX).toBe('portal.example.com')
    expect(env.PORTAL_PROVISIONING_SERVICE_EMAIL_DOMAIN).toBe(
      'service.portal.example.com',
    )
  })

  it('rejects provider tenant domain suffix values that are not host suffixes', () => {
    for (const value of [
      'https://portal.example.com',
      'portal.example.com/path',
      'portal.example.com:443',
      '*.portal.example.com',
      '.portal.example.com',
    ]) {
      expect(() =>
        loadEnv({
          ...baseRawEnv,
          PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX: value,
        }),
      ).toThrow(/PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX/)
    }
  })

  it('rejects provisioning service email domain values that are not host suffixes', () => {
    for (const value of [
      'https://service.portal.example.com',
      'service.portal.example.com/path',
      'service.portal.example.com:443',
      '*.service.portal.example.com',
      '.service.portal.example.com',
    ]) {
      expect(() =>
        loadEnv({
          ...baseRawEnv,
          PORTAL_PROVISIONING_SERVICE_EMAIL_DOMAIN: value,
        }),
      ).toThrow(/PORTAL_PROVISIONING_SERVICE_EMAIL_DOMAIN/)
    }
  })

  it('does not require operator provisioning configuration in production', () => {
    const env = loadEnv({
      ...baseRawEnv,
      BRANDING_ASSET_STORAGE_ACCESS_KEY_ID: 'portal-minio',
      BRANDING_ASSET_STORAGE_BUCKET: 'portal-branding-assets',
      BRANDING_ASSET_STORAGE_ENDPOINT: 'http://portal-object-storage:9000',
      BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY: 'portal-minio-secret',
      NODE_ENV: 'production',
    })

    expect(env.CHATWOOT_PLATFORM_API_ACCESS_TOKEN).toBeUndefined()
    expect(env.PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX).toBeUndefined()
    expect(env.PORTAL_PROVISIONING_SERVICE_EMAIL_DOMAIN).toBeUndefined()
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

  it('leaves branding asset storage unavailable by default', () => {
    const env = loadEnv(baseRawEnv)

    expect(env.BRANDING_ASSET_STORAGE_BUCKET).toBeUndefined()
    expect(env.BRANDING_ASSET_STORAGE_ENDPOINT).toBeUndefined()
    expect(env.BRANDING_ASSET_STORAGE_ACCESS_KEY_ID).toBeUndefined()
    expect(env.BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY).toBeUndefined()
    expect(env.BRANDING_ASSET_STORAGE_REGION).toBe('us-east-1')
    expect(env.BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE).toBe(true)
  })

  it('requires branding asset storage in production', () => {
    expect(() =>
      loadEnv({
        ...baseRawEnv,
        NODE_ENV: 'production',
      }),
    ).toThrow(/BRANDING_ASSET_STORAGE_ENDPOINT/)
  })

  it('accepts complete branding asset storage configuration in production', () => {
    const env = loadEnv({
      ...baseRawEnv,
      NODE_ENV: 'production',
      BRANDING_ASSET_STORAGE_ACCESS_KEY_ID: 'portal-minio',
      BRANDING_ASSET_STORAGE_BUCKET: 'portal-branding-assets',
      BRANDING_ASSET_STORAGE_ENDPOINT: 'http://portal-object-storage:9000',
      BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE: 'true',
      BRANDING_ASSET_STORAGE_REGION: 'us-east-1',
      BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY: 'portal-minio-secret',
    })

    expect(env.BRANDING_ASSET_STORAGE_ENDPOINT).toBe(
      'http://portal-object-storage:9000',
    )
  })

  it('continues allowing disabled branding asset storage outside production', () => {
    const env = loadEnv({
      ...baseRawEnv,
      NODE_ENV: 'test',
    })

    expect(env.BRANDING_ASSET_STORAGE_ENDPOINT).toBeUndefined()
  })

  it('accepts complete branding asset storage configuration', () => {
    const env = loadEnv({
      ...baseRawEnv,
      BRANDING_ASSET_STORAGE_ACCESS_KEY_ID: 'portal-minio',
      BRANDING_ASSET_STORAGE_BUCKET: 'portal-branding-assets',
      BRANDING_ASSET_STORAGE_ENDPOINT: 'http://127.0.0.1:9000',
      BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE: 'false',
      BRANDING_ASSET_STORAGE_REGION: 'eu-central-1',
      BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY: 'portal-minio-secret',
    })

    expect(env.BRANDING_ASSET_STORAGE_ACCESS_KEY_ID).toBe('portal-minio')
    expect(env.BRANDING_ASSET_STORAGE_BUCKET).toBe('portal-branding-assets')
    expect(env.BRANDING_ASSET_STORAGE_ENDPOINT).toBe('http://127.0.0.1:9000')
    expect(env.BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE).toBe(false)
    expect(env.BRANDING_ASSET_STORAGE_REGION).toBe('eu-central-1')
    expect(env.BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY).toBe(
      'portal-minio-secret',
    )
  })

  it('rejects partial branding asset storage configuration', () => {
    expect(() =>
      loadEnv({
        ...baseRawEnv,
        BRANDING_ASSET_STORAGE_BUCKET: 'portal-branding-assets',
      }),
    ).toThrow(/BRANDING_ASSET_STORAGE_ENDPOINT/)
  })
})
