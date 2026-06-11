import { describe, expect, it } from 'vitest'

import { portalTenants } from '../db/schema.js'
import { createTestDatabase } from './testDatabase.js'

describe('createTestDatabase isolation', () => {
  it('creates isolated databases from the migrated template', async () => {
    const firstDatabase = await createTestDatabase()
    const secondDatabase = await createTestDatabase()

    try {
      await firstDatabase.db.insert(portalTenants).values({
        chatwootAccountId: 1,
        chatwootApiAccessTokenCiphertext: 'token-ciphertext',
        chatwootBaseUrl: 'https://chatwoot.example.test',
        chatwootPortalInboxId: 10,
        chatwootWebhookSecretCiphertext: 'secret-ciphertext',
        displayName: 'Tenant One',
        primaryDomain: 'tenant-one.example.test',
        publicBaseUrl: 'https://tenant-one.example.test',
        slug: 'tenant-one',
      })

      const firstRows = await firstDatabase.db.select().from(portalTenants)
      const secondRows = await secondDatabase.db.select().from(portalTenants)

      expect(firstRows).toHaveLength(1)
      expect(secondRows).toHaveLength(0)
    } finally {
      await firstDatabase.close()
      await secondDatabase.close()
    }
  }, 15000)
})
