import { loadEnv } from '../config/env.js'
import { createDatabaseClient } from '../db/client.js'
import { runDatabaseMigrations } from '../db/migrate.js'
import { createChatwootClientFactory } from '../integrations/chatwoot/client.js'
import { createTenantsRepository } from '../modules/tenants/repository.js'
import {
  TenantChatwootVerificationError,
  verifyTenantChatwootConnection,
} from './verify-tenant-chatwoot-connection-core.js'

function readTenantSlug(argv: string[], defaultTenantSlug: string | undefined) {
  const tenantArg = argv.find((arg) => arg.startsWith('--tenant='))
  const tenantSlug = tenantArg?.slice('--tenant='.length) || defaultTenantSlug

  if (!tenantSlug?.trim()) {
    throw new TenantChatwootVerificationError(
      'Tenant slug is required. Pass --tenant=<slug> or DEFAULT_TENANT_SLUG.',
    )
  }

  return tenantSlug
}

const env = loadEnv()
const database = createDatabaseClient({
  connectionString: env.DATABASE_URL,
})

try {
  await runDatabaseMigrations(database.db)

  if (!env.PORTAL_TENANT_SECRET_KEY) {
    throw new TenantChatwootVerificationError(
      'PORTAL_TENANT_SECRET_KEY is required.',
    )
  }

  const result = await verifyTenantChatwootConnection({
    chatwootClientFactory: createChatwootClientFactory(),
    tenantSecretKey: env.PORTAL_TENANT_SECRET_KEY,
    tenantsRepository: createTenantsRepository(database.db),
    tenantSlug: readTenantSlug(process.argv.slice(2), env.DEFAULT_TENANT_SLUG),
  })

  console.log(JSON.stringify(result))
} finally {
  await database.close()
}
