import type {
  ChatwootClientConfig,
  ChatwootPortalContactCustomAttributeDefinitionsResult,
} from '../integrations/chatwoot/client.js'
import type { TenantsRepository } from '../modules/tenants/repository.js'
import {
  decodeTenantSecretKey,
  decryptTenantSecret,
} from '../modules/tenants/secrets.js'

type TenantPortalContactCustomAttributesClient = {
  ensurePortalContactCustomAttributeDefinitions: () => Promise<ChatwootPortalContactCustomAttributeDefinitionsResult>
}

type TenantPortalContactCustomAttributesClientFactory = {
  forTenant: (
    config: ChatwootClientConfig,
  ) => TenantPortalContactCustomAttributesClient
}

type EnsureTenantPortalContactCustomAttributesOptions = {
  chatwootClientFactory: TenantPortalContactCustomAttributesClientFactory
  tenantSecretKey: string
  tenantsRepository: Pick<TenantsRepository, 'findBySlug'>
  tenantSlug: string
}

export class TenantPortalContactCustomAttributesEnsureError extends Error {
  constructor(message: string) {
    super(message)

    this.name = 'TenantPortalContactCustomAttributesEnsureError'
  }
}

function normalizeTenantSlug(slug: string) {
  const normalizedSlug = slug.trim().toLowerCase()

  if (!normalizedSlug) {
    throw new TenantPortalContactCustomAttributesEnsureError(
      'Tenant slug is required.',
    )
  }

  return normalizedSlug
}

export async function ensureTenantPortalContactCustomAttributes({
  chatwootClientFactory,
  tenantSecretKey,
  tenantsRepository,
  tenantSlug,
}: EnsureTenantPortalContactCustomAttributesOptions) {
  const normalizedTenantSlug = normalizeTenantSlug(tenantSlug)
  const tenant = await tenantsRepository.findBySlug(normalizedTenantSlug)

  if (!tenant) {
    throw new TenantPortalContactCustomAttributesEnsureError(
      'Tenant was not found.',
    )
  }

  const key = decodeTenantSecretKey(tenantSecretKey)
  const customAttributes = await chatwootClientFactory
    .forTenant({
      accountId: tenant.chatwootAccountId,
      apiAccessToken: decryptTenantSecret(
        tenant.chatwootApiAccessTokenCiphertext,
        key,
      ),
      baseUrl: tenant.chatwootBaseUrl,
      portalInboxId: tenant.chatwootPortalInboxId,
    })
    .ensurePortalContactCustomAttributeDefinitions()

  return {
    customAttributes,
    result: 'ensured' as const,
    tenant: {
      chatwootAccountId: tenant.chatwootAccountId,
      chatwootBaseUrl: tenant.chatwootBaseUrl,
      id: tenant.id,
      slug: tenant.slug,
    },
  }
}
