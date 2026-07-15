import { describe, expect, it } from 'vitest'

import { assertE2eDatabaseSetupIsLocal } from './e2eDatabaseSafety.js'

const localSetup = {
  databaseUrl:
    'postgresql://portal:secret@127.0.0.1:55433/chatwoot_client_portal_v2',
  expectedDatabaseName: 'chatwoot_client_portal_v2',
  expectedPort: 55433,
  mutationConfirmation: 'allow-local-playwright-database-mutations',
  nodeEnv: 'development' as const,
}

describe('assertE2eDatabaseSetupIsLocal', () => {
  it.each([
    localSetup.databaseUrl,
    'postgresql://portal:secret@localhost:55433/chatwoot_client_portal_v2',
    'postgresql://portal:secret@[::1]:55433/chatwoot_client_portal_v2',
  ])('allows the documented local portal database shape: %s', (databaseUrl) => {
    expect(() =>
      assertE2eDatabaseSetupIsLocal({
        ...localSetup,
        databaseUrl,
      }),
    ).not.toThrow()
  })

  it('allows one exact private WSL host only with an explicit host allowlist', () => {
    expect(() =>
      assertE2eDatabaseSetupIsLocal({
        ...localSetup,
        allowedNonLoopbackHost: '10.255.255.254',
        databaseUrl:
          'postgresql://portal:secret@10.255.255.254:55433/chatwoot_client_portal_v2',
      }),
    ).not.toThrow()
  })

  it('rejects a matching private database without an exact host allowlist', () => {
    expect(() =>
      assertE2eDatabaseSetupIsLocal({
        ...localSetup,
        databaseUrl:
          'postgresql://portal:secret@10.255.255.254:55433/chatwoot_client_portal_v2',
      }),
    ).toThrow(
      'Playwright database setup is allowed only for the isolated local portal database.',
    )
  })

  it('rejects a private database when the allowlist names another host', () => {
    expect(() =>
      assertE2eDatabaseSetupIsLocal({
        ...localSetup,
        allowedNonLoopbackHost: '10.255.255.253',
        databaseUrl:
          'postgresql://portal:secret@10.255.255.254:55433/chatwoot_client_portal_v2',
      }),
    ).toThrow(
      'Playwright database setup is allowed only for the isolated local portal database.',
    )
  })

  it('rejects an exact public host allowlist', () => {
    expect(() =>
      assertE2eDatabaseSetupIsLocal({
        ...localSetup,
        allowedNonLoopbackHost: '203.0.113.8',
        databaseUrl:
          'postgresql://portal:secret@203.0.113.8:55433/chatwoot_client_portal_v2',
      }),
    ).toThrow(
      'Playwright database setup is allowed only for the isolated local portal database.',
    )
  })

  it('rejects query parameters that can override the parsed database target', () => {
    expect(() =>
      assertE2eDatabaseSetupIsLocal({
        ...localSetup,
        databaseUrl:
          'postgresql://portal:secret@127.0.0.1:55433/chatwoot_client_portal_v2?host=prod-db.internal&port=5432',
      }),
    ).toThrow(
      'Playwright database setup is allowed only for the isolated local portal database.',
    )
  })

  it('rejects loopback setup without deliberate mutation confirmation', () => {
    expect(() =>
      assertE2eDatabaseSetupIsLocal({
        ...localSetup,
        mutationConfirmation: undefined,
      }),
    ).toThrow(
      'Playwright database setup is allowed only for the isolated local portal database.',
    )
  })

  it('rejects a missing URI port instead of allowing PGPORT fallback', () => {
    expect(() =>
      assertE2eDatabaseSetupIsLocal({
        ...localSetup,
        databaseUrl:
          'postgresql://portal:secret@127.0.0.1/chatwoot_client_portal_v2',
        expectedPort: 5432,
      }),
    ).toThrow(
      'Playwright database setup is allowed only for the isolated local portal database.',
    )
  })

  it('rejects an inexact mutation confirmation', () => {
    expect(() =>
      assertE2eDatabaseSetupIsLocal({
        ...localSetup,
        mutationConfirmation: 'yes',
      }),
    ).toThrow(
      'Playwright database setup is allowed only for the isolated local portal database.',
    )
  })

  it.each([
    {
      ...localSetup,
      databaseUrl:
        'postgresql://portal:secret@db.example.com:55433/chatwoot_client_portal_v2',
    },
    {
      ...localSetup,
      databaseUrl:
        'postgresql://portal:secret@127.0.0.1:5432/chatwoot_client_portal_v2',
    },
    {
      ...localSetup,
      databaseUrl:
        'postgresql://portal:secret@127.0.0.1:55433/production_portal',
    },
    {
      ...localSetup,
      nodeEnv: 'production' as const,
    },
  ])('rejects a non-local e2e database target', (input) => {
    expect(() => assertE2eDatabaseSetupIsLocal(input)).toThrow(
      'Playwright database setup is allowed only for the isolated local portal database.',
    )
  })

  it('rejects malformed database URLs without including their value in the error', () => {
    expect(() =>
      assertE2eDatabaseSetupIsLocal({
        ...localSetup,
        databaseUrl: 'not-a-database-url-with-secret',
      }),
    ).toThrow(
      'Playwright database setup is allowed only for the isolated local portal database.',
    )
  })
})
