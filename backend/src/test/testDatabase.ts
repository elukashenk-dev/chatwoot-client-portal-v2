import { PGlite } from '@electric-sql/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { drizzle } from 'drizzle-orm/pglite'

import type { DatabaseClient } from '../db/client.js'
import { MIGRATIONS_FOLDER } from '../db/migrate.js'
import * as schema from '../db/schema.js'

let migratedTemplateSnapshotPromise: Promise<Blob | File> | undefined

async function createMigratedTemplateSnapshot(): Promise<Blob | File> {
  const client = new PGlite()
  const db = drizzle({
    client,
    schema,
  })

  try {
    await migrate(db, {
      migrationsFolder: MIGRATIONS_FOLDER,
    })

    return await client.dumpDataDir('none')
  } finally {
    await client.close()
  }
}

function getMigratedTemplateSnapshot(): Promise<Blob | File> {
  migratedTemplateSnapshotPromise ??= createMigratedTemplateSnapshot().catch(
    (error: unknown) => {
      migratedTemplateSnapshotPromise = undefined
      throw error
    },
  )

  return migratedTemplateSnapshotPromise
}

export async function createTestDatabase(): Promise<DatabaseClient> {
  const migratedTemplateSnapshot = await getMigratedTemplateSnapshot()
  const client = new PGlite({
    loadDataDir: migratedTemplateSnapshot,
  })
  const db = drizzle({
    client,
    schema,
  })

  return {
    close: async () => {
      await client.close()
    },
    db,
  }
}
