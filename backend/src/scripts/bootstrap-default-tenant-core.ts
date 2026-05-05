import type { AppEnv } from '../config/env.js'
import type { AppDatabase } from '../db/client.js'
import {
  createTenantsRepository,
  type Tenant,
} from '../modules/tenants/repository.js'
import {
  decodeTenantSecretKey,
  encryptTenantSecret,
} from '../modules/tenants/secrets.js'

export class DefaultTenantBootstrapConfigError extends Error {
  constructor(message: string) {
    super(message)

    this.name = 'DefaultTenantBootstrapConfigError'
  }
}

type DefaultTenantBootstrapEnv = Pick<
  AppEnv,
  | 'DEFAULT_TENANT_CHATWOOT_ACCOUNT_ID'
  | 'DEFAULT_TENANT_CHATWOOT_API_ACCESS_TOKEN'
  | 'DEFAULT_TENANT_CHATWOOT_BASE_URL'
  | 'DEFAULT_TENANT_CHATWOOT_PORTAL_INBOX_ID'
  | 'DEFAULT_TENANT_CHATWOOT_WEBHOOK_SECRET'
  | 'DEFAULT_TENANT_DISPLAY_NAME'
  | 'DEFAULT_TENANT_PRIMARY_DOMAIN'
  | 'DEFAULT_TENANT_PUBLIC_BASE_URL'
  | 'DEFAULT_TENANT_SLUG'
  | 'PORTAL_TENANT_SECRET_KEY'
>

type BootstrapDefaultTenantOptions = {
  db: AppDatabase
  env: DefaultTenantBootstrapEnv
}

export type BootstrapDefaultTenantResult = {
  action: 'created' | 'updated'
  tenant: Tenant
}

function requireString(
  env: DefaultTenantBootstrapEnv,
  key: keyof DefaultTenantBootstrapEnv,
) {
  const value = env[key]

  if (typeof value !== 'string' || !value.trim()) {
    throw new DefaultTenantBootstrapConfigError(`${key} is required.`)
  }

  return value
}

function requireNumber(
  env: DefaultTenantBootstrapEnv,
  key: keyof DefaultTenantBootstrapEnv,
) {
  const value = env[key]

  if (typeof value !== 'number') {
    throw new DefaultTenantBootstrapConfigError(`${key} is required.`)
  }

  return value
}

export async function bootstrapDefaultTenant({
  db,
  env,
}: BootstrapDefaultTenantOptions): Promise<BootstrapDefaultTenantResult> {
  const repository = createTenantsRepository(db)
  const slug = requireString(env, 'DEFAULT_TENANT_SLUG')
  const existingTenant = await repository.findBySlug(slug)
  const tenantSecretKey = decodeTenantSecretKey(
    requireString(env, 'PORTAL_TENANT_SECRET_KEY'),
  )

  const tenant = await repository.upsertTenantBySlug({
    chatwootAccountId: requireNumber(env, 'DEFAULT_TENANT_CHATWOOT_ACCOUNT_ID'),
    chatwootApiAccessTokenCiphertext: encryptTenantSecret(
      requireString(env, 'DEFAULT_TENANT_CHATWOOT_API_ACCESS_TOKEN'),
      tenantSecretKey,
    ),
    chatwootBaseUrl: requireString(env, 'DEFAULT_TENANT_CHATWOOT_BASE_URL'),
    chatwootPortalInboxId: requireNumber(
      env,
      'DEFAULT_TENANT_CHATWOOT_PORTAL_INBOX_ID',
    ),
    chatwootWebhookSecretCiphertext: encryptTenantSecret(
      requireString(env, 'DEFAULT_TENANT_CHATWOOT_WEBHOOK_SECRET'),
      tenantSecretKey,
    ),
    displayName: requireString(env, 'DEFAULT_TENANT_DISPLAY_NAME'),
    primaryDomain: requireString(env, 'DEFAULT_TENANT_PRIMARY_DOMAIN'),
    publicBaseUrl: requireString(env, 'DEFAULT_TENANT_PUBLIC_BASE_URL'),
    slug,
    status: 'active',
  })

  return {
    action: existingTenant ? 'updated' : 'created',
    tenant,
  }
}

export function createSafeDefaultTenantBootstrapReport({
  action,
  tenant,
}: BootstrapDefaultTenantResult) {
  return {
    action,
    tenant: {
      chatwootAccountId: tenant.chatwootAccountId,
      chatwootBaseUrl: tenant.chatwootBaseUrl,
      chatwootPortalInboxId: tenant.chatwootPortalInboxId,
      displayName: tenant.displayName,
      hasChatwootApiAccessTokenCiphertext: Boolean(
        tenant.chatwootApiAccessTokenCiphertext,
      ),
      hasChatwootWebhookSecretCiphertext: Boolean(
        tenant.chatwootWebhookSecretCiphertext,
      ),
      id: tenant.id,
      primaryDomain: tenant.primaryDomain,
      publicBaseUrl: tenant.publicBaseUrl,
      slug: tenant.slug,
      status: tenant.status,
    },
  }
}
