import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnvFile } from 'node:process'

import { loadEnv } from '../../backend/src/config/env.ts'
import { createDatabaseClient } from '../../backend/src/db/client.ts'
import { bootstrapDefaultTenant } from '../../backend/src/scripts/bootstrap-default-tenant-core.ts'
import { assertE2eDatabaseSetupIsLocal } from '../../backend/src/test/e2eDatabaseSafety.ts'
import { seedE2eLegalDocuments } from '../../backend/src/test/e2eLegalDocuments.ts'
import { seedE2ePortalUser } from '../../backend/src/test/e2ePortalUser.ts'

export default async function globalSetup() {
  const projectRoot = process.cwd()
  const envFilePath = resolve(projectRoot, '.env')
  const databaseMutationConfirmation =
    process.env.E2E_DATABASE_MUTATION_CONFIRM?.trim()
  const allowedNonLoopbackDatabaseHost =
    process.env.E2E_DATABASE_ALLOWED_HOST?.trim()

  if (existsSync(envFilePath)) {
    loadEnvFile(envFilePath)
  }

  const env = loadEnv()
  assertE2eDatabaseSetupIsLocal({
    databaseUrl: env.DATABASE_URL,
    expectedDatabaseName: process.env.PORTAL_V2_POSTGRES_DB?.trim() ?? '',
    expectedPort: Number(process.env.PORTAL_V2_POSTGRES_PORT),
    mutationConfirmation: databaseMutationConfirmation,
    allowedNonLoopbackHost: allowedNonLoopbackDatabaseHost,
    nodeEnv: env.NODE_ENV,
  })
  const database = createDatabaseClient({
    connectionString: env.DATABASE_URL,
  })

  try {
    process.chdir(resolve(projectRoot, 'backend'))
    const { runDatabaseMigrations } =
      await import('../../backend/src/db/migrate.ts')

    await runDatabaseMigrations(database.db)
    process.chdir(projectRoot)

    await bootstrapDefaultTenant({
      db: database.db,
      env,
    })
    await seedE2eLegalDocuments(database.db)
    await seedE2ePortalUser(database.db)
  } finally {
    process.chdir(projectRoot)
    await database.close()
  }
}
