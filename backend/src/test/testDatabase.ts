import { PGlite } from '@electric-sql/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { drizzle } from 'drizzle-orm/pglite'

import type { DatabaseClient } from '../db/client.js'
import { MIGRATIONS_FOLDER } from '../db/migrate.js'
import * as schema from '../db/schema.js'

export async function createTestDatabase(): Promise<DatabaseClient> {
  const client = new PGlite()
  const db = drizzle({
    client,
    schema,
  })

  await migrate(db, {
    migrationsFolder: MIGRATIONS_FOLDER,
  })

  return {
    close: async () => {
      await client.close()
    },
    db,
  }
}
