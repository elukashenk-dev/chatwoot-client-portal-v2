import { loadEnv } from '../config/env.js'
import { createDatabaseClient } from '../db/client.js'
import { runDatabaseMigrations } from '../db/migrate.js'
import { createChatwootPlatformClient } from '../integrations/chatwoot/platformClient.js'
import { deprovisionTenant } from '../modules/tenant-provisioning/deprovision.js'
import { createTenantsRepository } from '../modules/tenants/repository.js'
import {
  DeprovisionTenantCliConfigError,
  parseDeprovisionTenantArgs,
} from './deprovision-tenant-core.js'

async function main() {
  const env = loadEnv()
  const args = parseDeprovisionTenantArgs(process.argv.slice(2))
  const platformApiAccessToken = env.CHATWOOT_PLATFORM_API_ACCESS_TOKEN

  if (!platformApiAccessToken) {
    throw new DeprovisionTenantCliConfigError(
      'CHATWOOT_PLATFORM_API_ACCESS_TOKEN is required.',
    )
  }

  const database = createDatabaseClient({
    connectionString: env.DATABASE_URL,
  })

  try {
    await runDatabaseMigrations(database.db)

    const tenantsRepository = createTenantsRepository(database.db)
    const tenant = await tenantsRepository.findBySlug(args.tenantSlug)

    if (!tenant) {
      throw new Error('Tenant was not found.')
    }

    const result = await deprovisionTenant({
      confirmSlug: args.confirmSlug,
      deleteChatwootAccount: args.deleteChatwootAccount,
      platformClient: createChatwootPlatformClient({
        config: {
          apiAccessToken: platformApiAccessToken,
          baseUrl: tenant.chatwootBaseUrl,
        },
        requestTimeoutMs: env.CHATWOOT_REQUEST_TIMEOUT_MS,
      }),
      tenantSlug: args.tenantSlug,
      tenantsRepository,
    })

    console.log(JSON.stringify(result, null, 2))
  } finally {
    await database.close()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
