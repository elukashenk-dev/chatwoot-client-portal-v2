import { buildApp } from './app.js'
import { loadEnv } from './config/env.js'
import { createDatabaseClient } from './db/client.js'
import { runDatabaseMigrations } from './db/migrate.js'

const env = loadEnv()
const database = createDatabaseClient({
  connectionString: env.DATABASE_URL,
})

let app: ReturnType<typeof buildApp> | null = null

try {
  await runDatabaseMigrations(database.db)

  app = buildApp({
    database,
    env,
  })

  await app.listen({
    host: '0.0.0.0',
    port: env.PORT,
  })
} catch (error) {
  if (app) {
    app.log.error(error)
    await app.close()
  } else {
    console.error(error)
    await database.close()
  }

  process.exit(1)
}
