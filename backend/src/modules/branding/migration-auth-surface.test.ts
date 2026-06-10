import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { describe, expect, it } from 'vitest'

import { MIGRATIONS_FOLDER } from '../../db/migrate.js'
import * as schema from '../../db/schema.js'

const legacyMigrationIndex = 12

async function createLegacyMigrationsFolder() {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'branding-legacy-migrations-'),
  )
  const migrationsFolder = path.join(tempRoot, 'drizzle')
  const metaFolder = path.join(migrationsFolder, 'meta')

  try {
    await fs.mkdir(metaFolder, { recursive: true })

    const migrationFiles = await fs.readdir(MIGRATIONS_FOLDER)

    await Promise.all(
      migrationFiles
        .filter((fileName) => /^\d{4}_.+\.sql$/u.test(fileName))
        .filter(
          (fileName) => Number(fileName.slice(0, 4)) <= legacyMigrationIndex,
        )
        .map((fileName) =>
          fs.copyFile(
            path.join(MIGRATIONS_FOLDER, fileName),
            path.join(migrationsFolder, fileName),
          ),
        ),
    )

    const sourceMetaFolder = path.join(MIGRATIONS_FOLDER, 'meta')
    const metaFiles = await fs.readdir(sourceMetaFolder)

    await Promise.all(
      metaFiles
        .filter((fileName) => /^\d{4}_snapshot\.json$/u.test(fileName))
        .filter(
          (fileName) => Number(fileName.slice(0, 4)) <= legacyMigrationIndex,
        )
        .map((fileName) =>
          fs.copyFile(
            path.join(sourceMetaFolder, fileName),
            path.join(metaFolder, fileName),
          ),
        ),
    )

    const journal = JSON.parse(
      await fs.readFile(path.join(sourceMetaFolder, '_journal.json'), 'utf8'),
    ) as {
      entries: Array<{ tag: string }>
    }

    await fs.writeFile(
      path.join(metaFolder, '_journal.json'),
      JSON.stringify(
        {
          ...journal,
          entries: journal.entries.filter(
            ({ tag }) => Number(tag.slice(0, 4)) <= legacyMigrationIndex,
          ),
        },
        null,
        2,
      ),
    )

    return {
      cleanup: () => fs.rm(tempRoot, { force: true, recursive: true }),
      migrationsFolder,
    }
  } catch (error) {
    await fs
      .rm(tempRoot, { force: true, recursive: true })
      .catch(() => undefined)
    throw error
  }
}

describe('branding auth surface migration', () => {
  it('backfills non-default legacy auth backgrounds without freezing default rows', async () => {
    const legacyMigrations = await createLegacyMigrationsFolder()
    const client = new PGlite()
    const db = drizzle({
      client,
      schema,
    })

    let testError: unknown

    try {
      await migrate(db, {
        migrationsFolder: legacyMigrations.migrationsFolder,
      })
      await client.query(`
        insert into portal_tenants (
          id,
          slug,
          display_name,
          primary_domain,
          public_base_url,
          chatwoot_base_url,
          chatwoot_account_id,
          chatwoot_portal_inbox_id,
          chatwoot_api_access_token_ciphertext,
          chatwoot_webhook_secret_ciphertext
        )
        values
          (
            101,
            'legacy-custom',
            'Legacy Custom',
            'legacy-custom.example.test',
            'https://legacy-custom.example.test',
            'https://chatwoot.example.test',
            3,
            6,
            'runtime-token',
            'webhook-secret'
          ),
          (
            102,
            'legacy-default',
            'Legacy Default',
            'legacy-default.example.test',
            'https://legacy-default.example.test',
            'https://chatwoot.example.test',
            4,
            7,
            'runtime-token',
            'webhook-secret'
          );
      `)
      await client.query(`
        insert into portal_branding_settings (
          tenant_id,
          auth_background_color,
          version
        )
        values
          (101, '#ddeeff', 1),
          (102, '#f3f7fc', 1);
      `)

      await migrate(db, {
        migrationsFolder: MIGRATIONS_FOLDER,
      })

      const result = await client.query<{
        auth_content_surface_color: string | null
        auth_content_surface_opacity: number | null
        tenant_id: number
      }>(`
        select
          tenant_id,
          auth_content_surface_color,
          auth_content_surface_opacity
        from portal_branding_settings
        order by tenant_id;
      `)

      expect(result.rows).toEqual([
        {
          auth_content_surface_color: '#ddeeff',
          auth_content_surface_opacity: 100,
          tenant_id: 101,
        },
        {
          auth_content_surface_color: null,
          auth_content_surface_opacity: null,
          tenant_id: 102,
        },
      ])
    } catch (error) {
      testError = error
    }

    const cleanupResults = await Promise.allSettled([
      client.close(),
      legacyMigrations.cleanup(),
    ])
    const cleanupError = cleanupResults.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    )

    if (testError !== undefined) {
      throw testError
    }

    if (cleanupError) {
      throw cleanupError.reason
    }
  }, 15_000)
})
