import { createDatabaseClient } from '../db/client.js'
import { runDatabaseMigrations } from '../db/migrate.js'
import {
  cleanupMaintenanceData,
  parseCleanupMaintenanceArgs,
} from './cleanup-maintenance-data-core.js'

async function main() {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error('DATABASE_URL is required.')
  }

  const parsedArgs = parseCleanupMaintenanceArgs(process.argv.slice(2))
  const database = createDatabaseClient({
    connectionString,
  })

  try {
    await runDatabaseMigrations(database.db)
    const cleanupOptions: Parameters<typeof cleanupMaintenanceData>[0] = {
      db: database.db,
      dryRun: parsedArgs.dryRun,
    }

    if (parsedArgs.tenantId !== undefined) {
      cleanupOptions.tenantId = parsedArgs.tenantId
    }

    const report = await cleanupMaintenanceData(cleanupOptions)

    console.log(JSON.stringify(report, null, 2))
  } finally {
    await database.close()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
