import type {
  ChatwootClientConfig,
  ChatwootPortalInboxWebhook,
} from '../integrations/chatwoot/client.js'
import type { TenantsRepository } from '../modules/tenants/repository.js'
import {
  decodeTenantSecretKey,
  decryptTenantSecret,
  encryptTenantSecret,
} from '../modules/tenants/secrets.js'
import { DEFAULT_WEBHOOK_PATH } from './configure-chatwoot-account-webhook-core.js'

type ConfigureTenantWebhookOptions = {
  callbackUrl?: string | undefined
  createChatwootClient: (config: ChatwootClientConfig) => {
    configurePortalInboxWebhook: (options: {
      url: string
    }) => Promise<ChatwootPortalInboxWebhook>
  }
  tenantSecretKey: string
  tenantsRepository: Pick<
    TenantsRepository,
    'findBySlug' | 'updateChatwootWebhookSecretCiphertext'
  >
  tenantSlug: string
}

export type ConfigureTenantWebhookResult = {
  action: 'updated'
  callbackUrl: string
  secretSource: 'api-channel-inbox'
  secretStored: true
  tenant: {
    chatwootAccountId: number
    chatwootBaseUrl: string
    id: number
    publicBaseUrl: string
    slug: string
  }
  webhook: {
    hasSecret: boolean
    id: number
    url: string
  }
}

function normalizeTenantSlug(slug: string) {
  const normalizedSlug = slug.trim().toLowerCase()

  if (!normalizedSlug) {
    throw new Error('Tenant slug is required.')
  }

  return normalizedSlug
}

function buildCallbackUrl({
  callbackUrl,
  publicBaseUrl,
}: {
  callbackUrl?: string | undefined
  publicBaseUrl: string
}) {
  if (callbackUrl?.trim()) {
    return callbackUrl.trim()
  }

  return new URL(DEFAULT_WEBHOOK_PATH, `${publicBaseUrl}/`).toString()
}

export async function configureTenantChatwootWebhook({
  callbackUrl,
  createChatwootClient,
  tenantSecretKey,
  tenantsRepository,
  tenantSlug,
}: ConfigureTenantWebhookOptions): Promise<ConfigureTenantWebhookResult> {
  const normalizedTenantSlug = normalizeTenantSlug(tenantSlug)
  const tenant = await tenantsRepository.findBySlug(normalizedTenantSlug)

  if (!tenant) {
    throw new Error(`Tenant "${normalizedTenantSlug}" was not found.`)
  }

  const key = decodeTenantSecretKey(tenantSecretKey)
  const resolvedCallbackUrl = buildCallbackUrl({
    callbackUrl,
    publicBaseUrl: tenant.publicBaseUrl,
  })
  const result = await createChatwootClient({
    accountId: tenant.chatwootAccountId,
    apiAccessToken: decryptTenantSecret(
      tenant.chatwootApiAccessTokenCiphertext,
      key,
    ),
    baseUrl: tenant.chatwootBaseUrl,
    portalInboxId: tenant.chatwootPortalInboxId,
  }).configurePortalInboxWebhook({
    url: resolvedCallbackUrl,
  })

  if (!result.secret) {
    throw new Error(
      `Chatwoot did not return an API Channel webhook secret for tenant "${tenant.slug}".`,
    )
  }

  if (!result.url) {
    throw new Error(
      `Chatwoot did not return an API Channel webhook URL for tenant "${tenant.slug}".`,
    )
  }

  await tenantsRepository.updateChatwootWebhookSecretCiphertext({
    chatwootWebhookSecretCiphertext: encryptTenantSecret(result.secret, key),
    tenantId: tenant.id,
  })

  return {
    action: 'updated',
    callbackUrl: result.url,
    secretSource: 'api-channel-inbox',
    secretStored: true,
    tenant: {
      chatwootAccountId: tenant.chatwootAccountId,
      chatwootBaseUrl: tenant.chatwootBaseUrl,
      id: tenant.id,
      publicBaseUrl: tenant.publicBaseUrl,
      slug: tenant.slug,
    },
    webhook: {
      hasSecret: true,
      id: result.id,
      url: result.url,
    },
  }
}

export function createSafeTenantWebhookReport(
  result: ConfigureTenantWebhookResult,
) {
  return result
}
