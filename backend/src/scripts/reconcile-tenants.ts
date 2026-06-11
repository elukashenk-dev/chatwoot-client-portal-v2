import { loadEnv } from '../config/env.js'
import { createDatabaseClient } from '../db/client.js'
import { runDatabaseMigrations } from '../db/migrate.js'
import { createChatwootPlatformClient } from '../integrations/chatwoot/platformClient.js'
import { createTenantProvisioningRepository } from '../modules/tenant-provisioning/repository.js'
import { reconcileTenantChatwootAccounts } from '../modules/tenant-provisioning/reconciliation.js'
import { createTenantsRepository } from '../modules/tenants/repository.js'
import {
  parseReconcileTenantsArgs,
  ReconcileTenantsCliConfigError,
} from './reconcile-tenants-core.js'

async function main() {
  const env = loadEnv()
  const platformApiAccessToken = env.CHATWOOT_PLATFORM_API_ACCESS_TOKEN

  if (!platformApiAccessToken) {
    throw new ReconcileTenantsCliConfigError(
      'CHATWOOT_PLATFORM_API_ACCESS_TOKEN is required.',
    )
  }

  const args = parseReconcileTenantsArgs(process.argv.slice(2))
  const database = createDatabaseClient({
    connectionString: env.DATABASE_URL,
  })

  try {
    await runDatabaseMigrations(database.db)

    const result = await reconcileTenantChatwootAccounts({
      dryRun: args.dryRun,
      platformClientFactory: (baseUrl) =>
        createChatwootPlatformClient({
          config: {
            apiAccessToken: platformApiAccessToken,
            baseUrl,
          },
          requestTimeoutMs: env.CHATWOOT_REQUEST_TIMEOUT_MS,
        }),
      provisioningRepository: createTenantProvisioningRepository(database.db),
      tenantsRepository: createTenantsRepository(database.db),
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
