import path from 'node:path'

import { migrate } from 'drizzle-orm/node-postgres/migrator'

import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

export const MIGRATIONS_FOLDER = path.resolve(process.cwd(), 'drizzle')

export async function runDatabaseMigrations(
  db: NodePgDatabase<Record<string, unknown>>,
) {
  await migrate(db, {
    migrationsFolder: MIGRATIONS_FOLDER,
  })
}
