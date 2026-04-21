import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from './schema.js'

export type AppDatabase = PgDatabase<PgQueryResultHKT, typeof schema>
export type NodeAppDatabase = NodePgDatabase<typeof schema>

export type DatabaseClient<TDatabase extends AppDatabase = AppDatabase> = {
  close: () => Promise<void>
  db: TDatabase
}

type CreateDatabaseClientOptions = {
  connectionString: string
}

export function createDatabaseClient({
  connectionString,
}: CreateDatabaseClientOptions): DatabaseClient<NodeAppDatabase> {
  const pool = new Pool({
    connectionString,
  })

  return {
    close: async () => {
      await pool.end()
    },
    db: drizzle({
      client: pool,
      schema,
    }),
  }
}
