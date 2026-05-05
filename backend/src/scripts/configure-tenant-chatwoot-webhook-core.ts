import type { ChatwootClientConfig } from '../integrations/chatwoot/client.js'
import type { TenantsRepository } from '../modules/tenants/repository.js'
import {
  decodeTenantSecretKey,
  decryptTenantSecret,
  encryptTenantSecret,
} from '../modules/tenants/secrets.js'
import {
  DEFAULT_WEBHOOK_PATH,
  DEFAULT_WEBHOOK_SUBSCRIPTIONS,
  configureAccountWebhook,
  type ChatwootAccountWebhookClient,
} from './configure-chatwoot-account-webhook-core.js'

type ConfigureTenantWebhookOptions = {
  callbackUrl?: string | undefined
  createChatwootClient: (
    config: ChatwootClientConfig,
  ) => ChatwootAccountWebhookClient
  explicitWebhookId: number | null
  subscriptions?: string[] | undefined
  tenantSecretKey: string
  tenantsRepository: Pick<
    TenantsRepository,
    'findBySlug' | 'updateChatwootWebhookSecretCiphertext'
  >
  tenantSlug: string
}

export type ConfigureTenantWebhookResult = {
  action: 'created' | 'updated'
  callbackUrl: string
  secretSource: 'matched-webhook' | 'refreshed-list' | 'save-response'
  secretStored: true
  subscriptions: string[]
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

function normalizeSubscriptions(subscriptions: string[] | undefined) {
  const normalizedSubscriptions = [
    ...new Set(
      (subscriptions ?? DEFAULT_WEBHOOK_SUBSCRIPTIONS)
        .map((subscription) => subscription.trim())
        .filter(Boolean),
    ),
  ]

  return normalizedSubscriptions.length > 0
    ? normalizedSubscriptions
    : DEFAULT_WEBHOOK_SUBSCRIPTIONS
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
  explicitWebhookId,
  subscriptions,
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
  const result = await configureAccountWebhook({
    callbackUrl: resolvedCallbackUrl,
    chatwootClient: createChatwootClient({
      accountId: tenant.chatwootAccountId,
      apiAccessToken: decryptTenantSecret(
        tenant.chatwootApiAccessTokenCiphertext,
        key,
      ),
      baseUrl: tenant.chatwootBaseUrl,
      portalInboxId: tenant.chatwootPortalInboxId,
    }),
    explicitWebhookId,
    subscriptions: normalizeSubscriptions(subscriptions),
  })

  if (!result.secret || result.secretSource === 'missing') {
    throw new Error(
      `Chatwoot did not return a webhook secret for tenant "${tenant.slug}".`,
    )
  }

  await tenantsRepository.updateChatwootWebhookSecretCiphertext({
    chatwootWebhookSecretCiphertext: encryptTenantSecret(result.secret, key),
    tenantId: tenant.id,
  })

  return {
    action: result.action,
    callbackUrl: result.callbackUrl,
    secretSource: result.secretSource,
    secretStored: true,
    subscriptions: result.subscriptions,
    tenant: {
      chatwootAccountId: tenant.chatwootAccountId,
      chatwootBaseUrl: tenant.chatwootBaseUrl,
      id: tenant.id,
      publicBaseUrl: tenant.publicBaseUrl,
      slug: tenant.slug,
    },
    webhook: result.webhook,
  }
}

export function createSafeTenantWebhookReport(
  result: ConfigureTenantWebhookResult,
) {
  return result
}
