import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { portalLegalDocuments } from '../../db/schema.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import { seedTestTenant } from '../../test/testTenants.js'
import { createLegalDocumentsRepository } from './repository.js'

function createInput(version: string, bodyText = 'Legal document body text') {
  return {
    bodyText,
    documentType: 'terms' as const,
    sourceByteSize: 32,
    sourceContentType: 'text/plain',
    sourceFileName: `${version}.txt`,
    sourceSha256: version.padEnd(64, 'a'),
    title: 'Пользовательское соглашение',
    version,
  }
}

describe('createLegalDocumentsRepository', () => {
  it('returns null when the tenant has no active document', async () => {
    const database = await createTestDatabase()

    try {
      const tenant = await seedTestTenant(database.db)
      const repository = createLegalDocumentsRepository(database.db, {
        tenantId: tenant.id,
      })

      await expect(repository.findActiveDocument('terms')).resolves.toBeNull()
    } finally {
      await database.close()
    }
  }, 15_000)

  it('activates documents inside one tenant without leaking another tenant', async () => {
    const database = await createTestDatabase()

    try {
      const tenantA = await seedTestTenant(database.db, {
        primaryDomain: 'alpha.example.test',
        slug: 'alpha',
      })
      const tenantB = await seedTestTenant(database.db, {
        primaryDomain: 'beta.example.test',
        slug: 'beta',
      })
      const repositoryA = createLegalDocumentsRepository(database.db, {
        tenantId: tenantA.id,
      })
      const repositoryB = createLegalDocumentsRepository(database.db, {
        tenantId: tenantB.id,
      })

      await repositoryA.activateDocument(createInput('v1'))
      await repositoryB.activateDocument(createInput('tenant-b'))
      await repositoryA.activateDocument(
        createInput('v2', 'Updated legal body text'),
      )

      await expect(
        repositoryA.findActiveDocument('terms'),
      ).resolves.toMatchObject({
        bodyText: 'Updated legal body text',
        status: 'active',
        tenantId: tenantA.id,
        version: 'v2',
      })
      await expect(
        repositoryB.findActiveDocument('terms'),
      ).resolves.toMatchObject({
        status: 'active',
        tenantId: tenantB.id,
        version: 'tenant-b',
      })

      const tenantADocuments = await database.db
        .select()
        .from(portalLegalDocuments)
        .where(
          and(
            eq(portalLegalDocuments.tenantId, tenantA.id),
            eq(portalLegalDocuments.documentType, 'terms'),
          ),
        )
        .orderBy(portalLegalDocuments.id)

      expect(tenantADocuments).toHaveLength(2)
      expect(tenantADocuments[0]).toMatchObject({
        archivedAt: expect.any(Date),
        status: 'archived',
        version: 'v1',
      })
      expect(tenantADocuments[1]).toMatchObject({
        archivedAt: null,
        status: 'active',
        version: 'v2',
      })
    } finally {
      await database.close()
    }
  }, 15_000)
})
