import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { AppEnv } from '../config/env.js'
import type { DatabaseClient } from '../db/client.js'
import {
  createTenantsRepository,
  type Tenant,
  TenantValidationError,
} from '../modules/tenants/repository.js'
import {
  decodeTenantSecretKey,
  decryptTenantSecret,
} from '../modules/tenants/secrets.js'
import { createTestDatabase } from '../test/testDatabase.js'
import {
  bootstrapDefaultTenant,
  createSafeDefaultTenantBootstrapReport,
  DefaultTenantBootstrapConfigError,
} from './bootstrap-default-tenant-core.js'

const tenantSecretKey = Buffer.alloc(32, 4).toString('base64')

function createBootstrapEnv(
  overrides: Partial<AppEnv> = {},
): Pick<
  AppEnv,
  | 'DEFAULT_TENANT_CHATWOOT_ACCOUNT_ID'
  | 'DEFAULT_TENANT_CHATWOOT_ADMIN_VERIFICATION_TOKEN'
  | 'DEFAULT_TENANT_CHATWOOT_API_ACCESS_TOKEN'
  | 'DEFAULT_TENANT_CHATWOOT_BASE_URL'
  | 'DEFAULT_TENANT_CHATWOOT_PORTAL_INBOX_ID'
  | 'DEFAULT_TENANT_CHATWOOT_WEBHOOK_SECRET'
  | 'DEFAULT_TENANT_DISPLAY_NAME'
  | 'DEFAULT_TENANT_PRIMARY_DOMAIN'
  | 'DEFAULT_TENANT_PUBLIC_BASE_URL'
  | 'DEFAULT_TENANT_SLUG'
  | 'PORTAL_TENANT_SECRET_KEY'
> {
  return {
    DEFAULT_TENANT_CHATWOOT_ACCOUNT_ID: 1,
    DEFAULT_TENANT_CHATWOOT_ADMIN_VERIFICATION_TOKEN: undefined,
    DEFAULT_TENANT_CHATWOOT_API_ACCESS_TOKEN: 'chatwoot-api-token',
    DEFAULT_TENANT_CHATWOOT_BASE_URL: 'https://chatwoot.example.com',
    DEFAULT_TENANT_CHATWOOT_PORTAL_INBOX_ID: 5,
    DEFAULT_TENANT_CHATWOOT_WEBHOOK_SECRET: 'chatwoot-webhook-secret',
    DEFAULT_TENANT_DISPLAY_NAME: 'Default Tenant',
    DEFAULT_TENANT_PRIMARY_DOMAIN: 'lk.example.com',
    DEFAULT_TENANT_PUBLIC_BASE_URL: 'https://lk.example.com',
    DEFAULT_TENANT_SLUG: 'default',
    PORTAL_TENANT_SECRET_KEY: tenantSecretKey,
    ...overrides,
  }
}

describe('bootstrapDefaultTenant', () => {
  let database: DatabaseClient

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.close()
  })

  it('creates a default tenant with encrypted Chatwoot runtime secrets', async () => {
    const result = await bootstrapDefaultTenant({
      db: database.db,
      env: createBootstrapEnv(),
    })
    const key = decodeTenantSecretKey(tenantSecretKey)

    expect(result.action).toBe('created')
    expect(result.tenant).toMatchObject({
      chatwootAccountId: 1,
      chatwootBaseUrl: 'https://chatwoot.example.com',
      chatwootPortalInboxId: 5,
      primaryDomain: 'lk.example.com',
      publicBaseUrl: 'https://lk.example.com',
      slug: 'default',
      status: 'active',
    })
    expect(
      decryptTenantSecret(result.tenant.chatwootApiAccessTokenCiphertext, key),
    ).toBe('chatwoot-api-token')
    expect(
      decryptTenantSecret(result.tenant.chatwootWebhookSecretCiphertext, key),
    ).toBe('chatwoot-webhook-secret')
    expect(result.tenant.chatwootAdminVerificationTokenCiphertext).toBeNull()

    const report = createSafeDefaultTenantBootstrapReport(result)

    expect(JSON.stringify(report)).not.toContain('chatwoot-api-token')
    expect(JSON.stringify(report)).not.toContain('chatwoot-webhook-secret')
    expect(report.tenant.hasChatwootAdminVerificationTokenCiphertext).toBe(
      false,
    )
  })

  it('stores an optional encrypted Chatwoot admin verification token', async () => {
    const result = await bootstrapDefaultTenant({
      db: database.db,
      env: createBootstrapEnv({
        DEFAULT_TENANT_CHATWOOT_ADMIN_VERIFICATION_TOKEN:
          'chatwoot-admin-verification-token',
      }),
    })
    const key = decodeTenantSecretKey(tenantSecretKey)

    expect(
      decryptTenantSecret(
        result.tenant.chatwootAdminVerificationTokenCiphertext ?? '',
        key,
      ),
    ).toBe('chatwoot-admin-verification-token')

    const report = createSafeDefaultTenantBootstrapReport(result)

    expect(JSON.stringify(report)).not.toContain(
      'chatwoot-admin-verification-token',
    )
    expect(report.tenant.hasChatwootAdminVerificationTokenCiphertext).toBe(true)
  })

  it('updates the same default tenant when bootstrap is rerun', async () => {
    await bootstrapDefaultTenant({
      db: database.db,
      env: createBootstrapEnv(),
    })

    const result = await bootstrapDefaultTenant({
      db: database.db,
      env: createBootstrapEnv({
        DEFAULT_TENANT_CHATWOOT_PORTAL_INBOX_ID: 7,
        DEFAULT_TENANT_DISPLAY_NAME: 'Default Tenant Updated',
      }),
    })
    const repository = createTenantsRepository(database.db)

    await expect(repository.listTenants()).resolves.toHaveLength(1)
    expect(result).toMatchObject({
      action: 'updated',
      tenant: {
        chatwootPortalInboxId: 7,
        displayName: 'Default Tenant Updated',
      } satisfies Partial<Tenant>,
    })
  })

  it('preserves an existing admin verification token when bootstrap reruns without the optional env value', async () => {
    await bootstrapDefaultTenant({
      db: database.db,
      env: createBootstrapEnv({
        DEFAULT_TENANT_CHATWOOT_ADMIN_VERIFICATION_TOKEN:
          'existing-admin-verification-token',
      }),
    })

    const result = await bootstrapDefaultTenant({
      db: database.db,
      env: createBootstrapEnv({
        DEFAULT_TENANT_CHATWOOT_ADMIN_VERIFICATION_TOKEN: undefined,
        DEFAULT_TENANT_DISPLAY_NAME: 'Default Tenant Updated',
      }),
    })
    const key = decodeTenantSecretKey(tenantSecretKey)

    expect(
      decryptTenantSecret(
        result.tenant.chatwootAdminVerificationTokenCiphertext ?? '',
        key,
      ),
    ).toBe('existing-admin-verification-token')
    expect(result.tenant.displayName).toBe('Default Tenant Updated')
  })

  it('fails clearly when required bootstrap env is missing', async () => {
    await expect(
      bootstrapDefaultTenant({
        db: database.db,
        env: createBootstrapEnv({
          DEFAULT_TENANT_CHATWOOT_API_ACCESS_TOKEN: undefined,
        }),
      }),
    ).rejects.toThrow(DefaultTenantBootstrapConfigError)
  })

  it('rejects a default tenant whose public URL host does not match its primary domain', async () => {
    await expect(
      bootstrapDefaultTenant({
        db: database.db,
        env: createBootstrapEnv({
          DEFAULT_TENANT_PRIMARY_DOMAIN: 'lk.example.com',
          DEFAULT_TENANT_PUBLIC_BASE_URL: 'https://lk.other-example.com',
        }),
      }),
    ).rejects.toThrow(TenantValidationError)
  })
})
