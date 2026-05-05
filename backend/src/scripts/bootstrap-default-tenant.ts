import { loadEnv } from '../config/env.js'
import { createDatabaseClient } from '../db/client.js'
import { runDatabaseMigrations } from '../db/migrate.js'
import {
  bootstrapDefaultTenant,
  createSafeDefaultTenantBootstrapReport,
} from './bootstrap-default-tenant-core.js'

const env = loadEnv()
const database = createDatabaseClient({
  connectionString: env.DATABASE_URL,
})

try {
  await runDatabaseMigrations(database.db)

  const result = await bootstrapDefaultTenant({
    db: database.db,
    env,
  })

  console.log(JSON.stringify(createSafeDefaultTenantBootstrapReport(result)))
} finally {
  await database.close()
}
