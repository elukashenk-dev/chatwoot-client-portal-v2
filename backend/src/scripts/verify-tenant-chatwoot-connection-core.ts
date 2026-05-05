import type {
  ChatwootClientConfig,
  ChatwootPortalInboxRouting,
} from '../integrations/chatwoot/client.js'
import type { TenantsRepository } from '../modules/tenants/repository.js'
import {
  decodeTenantSecretKey,
  decryptTenantSecret,
} from '../modules/tenants/secrets.js'

type TenantChatwootVerificationClient = {
  verifyPortalInboxConnection: () => Promise<ChatwootPortalInboxRouting>
}

type TenantChatwootVerificationClientFactory = {
  forTenant: (config: ChatwootClientConfig) => TenantChatwootVerificationClient
}

type VerifyTenantChatwootConnectionOptions = {
  chatwootClientFactory: TenantChatwootVerificationClientFactory
  tenantSecretKey: string
  tenantsRepository: Pick<TenantsRepository, 'findBySlug'>
  tenantSlug: string
}

export class TenantChatwootVerificationError extends Error {
  constructor(message: string) {
    super(message)

    this.name = 'TenantChatwootVerificationError'
  }
}

function normalizeTenantSlug(slug: string) {
  const normalizedSlug = slug.trim().toLowerCase()

  if (!normalizedSlug) {
    throw new TenantChatwootVerificationError('Tenant slug is required.')
  }

  return normalizedSlug
}

export async function verifyTenantChatwootConnection({
  chatwootClientFactory,
  tenantSecretKey,
  tenantsRepository,
  tenantSlug,
}: VerifyTenantChatwootConnectionOptions) {
  const normalizedTenantSlug = normalizeTenantSlug(tenantSlug)
  const tenant = await tenantsRepository.findBySlug(normalizedTenantSlug)

  if (!tenant) {
    throw new TenantChatwootVerificationError('Tenant was not found.')
  }

  const key = decodeTenantSecretKey(tenantSecretKey)
  const config = {
    accountId: tenant.chatwootAccountId,
    apiAccessToken: decryptTenantSecret(
      tenant.chatwootApiAccessTokenCiphertext,
      key,
    ),
    baseUrl: tenant.chatwootBaseUrl,
    portalInboxId: tenant.chatwootPortalInboxId,
  }
  const inbox = await chatwootClientFactory
    .forTenant(config)
    .verifyPortalInboxConnection()

  return {
    result: 'verified' as const,
    tenant: {
      chatwootAccountId: tenant.chatwootAccountId,
      chatwootBaseUrl: tenant.chatwootBaseUrl,
      chatwootPortalInboxId: tenant.chatwootPortalInboxId,
      id: tenant.id,
      slug: tenant.slug,
    },
    verifiedInbox: {
      channelType: inbox.channelType,
      id: inbox.id,
      lockToSingleConversation: inbox.lockToSingleConversation,
    },
  }
}
