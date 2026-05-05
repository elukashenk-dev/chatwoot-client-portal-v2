import type { AppDatabase } from '../db/client.js'
import { portalTenants } from '../db/schema.js'

type SeedTestTenantOptions = {
  displayName?: string
  primaryDomain?: string
  publicBaseUrl?: string
  slug?: string
}

export async function seedTestTenant(
  db: AppDatabase,
  {
    displayName = 'Test Tenant',
    primaryDomain = 'localhost',
    publicBaseUrl = 'http://127.0.0.1:5173',
    slug = 'default',
  }: SeedTestTenantOptions = {},
) {
  const [tenant] = await db
    .insert(portalTenants)
    .values({
      chatwootAccountId: 1,
      chatwootApiAccessTokenCiphertext: 'tenant-api-token-ciphertext',
      chatwootBaseUrl: 'https://chatwoot.example.test',
      chatwootPortalInboxId: 1,
      chatwootWebhookSecretCiphertext: 'tenant-webhook-secret-ciphertext',
      displayName,
      primaryDomain,
      publicBaseUrl,
      slug,
    })
    .returning({
      id: portalTenants.id,
      slug: portalTenants.slug,
    })

  if (!tenant) {
    throw new Error('Failed to seed test tenant.')
  }

  return tenant
}
