import { loadEnv } from '../config/env.js'
import { createDatabaseClient } from './client.js'
import { runDatabaseMigrations } from './migrate.js'

const env = loadEnv()
const database = createDatabaseClient({
  connectionString: env.DATABASE_URL,
})

try {
  await runDatabaseMigrations(database.db)
} finally {
  await database.close()
}
