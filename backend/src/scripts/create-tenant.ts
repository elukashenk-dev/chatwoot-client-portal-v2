import { loadEnv } from '../config/env.js'
import { createDatabaseClient } from '../db/client.js'
import { runDatabaseMigrations } from '../db/migrate.js'
import { createChatwootClientFactory } from '../integrations/chatwoot/client.js'
import { createChatwootPlatformClient } from '../integrations/chatwoot/platformClient.js'
import { createTenantProvisioningRepository } from '../modules/tenant-provisioning/repository.js'
import { provisionTenant } from '../modules/tenant-provisioning/service.js'
import { createTenantsRepository } from '../modules/tenants/repository.js'
import {
  buildCreateTenantRuntimeConfig,
  createSafeTenantProvisioningReport,
  parseCreateTenantArgs,
} from './create-tenant-core.js'

async function main() {
  const env = loadEnv()
  const runtimeConfig = buildCreateTenantRuntimeConfig({
    args: parseCreateTenantArgs(process.argv.slice(2)),
    env,
  })
  const database = createDatabaseClient({
    connectionString: runtimeConfig.databaseUrl,
  })

  try {
    await runDatabaseMigrations(database.db)

    const chatwootClientFactory = createChatwootClientFactory({
      requestTimeoutMs: env.CHATWOOT_REQUEST_TIMEOUT_MS,
    })
    const result = await provisionTenant({
      chatwootAccountClientFactory: (config) =>
        chatwootClientFactory.forTenant(config),
      input: runtimeConfig.provisioningInput,
      platformClient: createChatwootPlatformClient({
        config: {
          apiAccessToken: runtimeConfig.platformApiAccessToken,
          baseUrl: runtimeConfig.provisioningInput.chatwootBaseUrl,
        },
        requestTimeoutMs: env.CHATWOOT_REQUEST_TIMEOUT_MS,
      }),
      provisioningRepository: createTenantProvisioningRepository(database.db),
      tenantSecretKey: runtimeConfig.tenantSecretKey,
      tenantsRepository: createTenantsRepository(database.db),
    })

    console.log(
      JSON.stringify(createSafeTenantProvisioningReport(result), null, 2),
    )
  } finally {
    await database.close()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
