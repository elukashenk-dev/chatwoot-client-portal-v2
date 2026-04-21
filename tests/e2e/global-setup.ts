import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnvFile } from 'node:process'

import { loadEnv } from '../../backend/src/config/env.ts'
import { createDatabaseClient } from '../../backend/src/db/client.ts'
import { seedE2ePortalUser } from '../../backend/src/test/e2ePortalUser.ts'

export default async function globalSetup() {
  const projectRoot = process.cwd()
  const envFilePath = resolve(projectRoot, '.env')

  if (existsSync(envFilePath)) {
    loadEnvFile(envFilePath)
  }

  const env = loadEnv()
  const database = createDatabaseClient({
    connectionString: env.DATABASE_URL,
  })

  try {
    process.chdir(resolve(projectRoot, 'backend'))
    const { runDatabaseMigrations } =
      await import('../../backend/src/db/migrate.ts')

    await runDatabaseMigrations(database.db)
    process.chdir(projectRoot)

    await seedE2ePortalUser(database.db)
  } finally {
    process.chdir(projectRoot)
    await database.close()
  }
}
