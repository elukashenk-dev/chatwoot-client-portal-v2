import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DatabaseClient } from '../db/client.js'
import { portalLegalDocuments } from '../db/schema.js'
import { createTestDatabase } from './testDatabase.js'
import { seedE2eLegalDocuments } from './e2eLegalDocuments.js'
import { seedTestTenant } from './testTenants.js'

describe('seedE2eLegalDocuments', () => {
  let database: DatabaseClient

  beforeEach(async () => {
    vi.stubEnv('E2E_TENANT_SLUG', 'default')
    database = await createTestDatabase()
    await seedTestTenant(database.db)
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await database.close()
  })

  it('creates missing synthetic documents once on a fresh e2e database', async () => {
    await expect(seedE2eLegalDocuments(database.db)).resolves.toEqual({
      created: ['privacy', 'terms'],
      unchanged: [],
    })
    await expect(seedE2eLegalDocuments(database.db)).resolves.toEqual({
      created: [],
      unchanged: ['privacy', 'terms'],
    })

    const documents = await database.db
      .select({
        documentType: portalLegalDocuments.documentType,
        status: portalLegalDocuments.status,
        version: portalLegalDocuments.version,
      })
      .from(portalLegalDocuments)
      .orderBy(portalLegalDocuments.documentType)

    expect(documents).toEqual([
      {
        documentType: 'privacy',
        status: 'active',
        version: 'e2e-privacy-v1',
      },
      {
        documentType: 'terms',
        status: 'active',
        version: 'e2e-terms-v1',
      },
    ])
  })

  it('preserves an existing active document and creates only the missing type', async () => {
    await database.db.insert(portalLegalDocuments).values({
      bodyText: 'Existing operator-provided terms.',
      documentType: 'terms',
      sourceByteSize: 33,
      sourceContentType: 'text/plain',
      sourceFileName: 'operator-terms.txt',
      sourceSha256: 'a'.repeat(64),
      tenantId: 1,
      title: 'Existing terms',
      version: 'operator-terms-v7',
    })

    await expect(seedE2eLegalDocuments(database.db)).resolves.toEqual({
      created: ['privacy'],
      unchanged: ['terms'],
    })

    const [terms] = await database.db
      .select()
      .from(portalLegalDocuments)
      .where(eq(portalLegalDocuments.documentType, 'terms'))

    expect(terms).toMatchObject({
      bodyText: 'Existing operator-provided terms.',
      status: 'active',
      version: 'operator-terms-v7',
    })
  })
})
