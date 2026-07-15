import { createHash } from 'node:crypto'

import { and, eq } from 'drizzle-orm'

import type { AppDatabase } from '../db/client.js'
import { portalLegalDocuments } from '../db/schema.js'
import type { LegalDocumentType } from '../modules/legal-documents/legalDocumentTypes.js'
import { findE2eTenantId } from './e2ePortalUser.js'

const E2E_LEGAL_DOCUMENTS = [
  {
    documentType: 'privacy',
    title: 'Политика обработки персональных данных',
  },
  {
    documentType: 'terms',
    title: 'Пользовательское соглашение',
  },
] as const satisfies ReadonlyArray<{
  documentType: LegalDocumentType
  title: string
}>

function createSyntheticDocumentInput({
  documentType,
  tenantId,
  title,
}: {
  documentType: LegalDocumentType
  tenantId: number
  title: string
}) {
  const bodyText =
    'Синтетический юридический документ только для локальных Playwright-тестов.'
  const source = Buffer.from(bodyText)

  return {
    bodyText,
    documentType,
    sourceByteSize: source.byteLength,
    sourceContentType: 'text/plain',
    sourceFileName: `e2e-${documentType}.txt`,
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    tenantId,
    title,
    version: `e2e-${documentType}-v1`,
  }
}

export async function seedE2eLegalDocuments(db: AppDatabase) {
  return db.transaction(async (transaction) => {
    const tenantId = await findE2eTenantId(transaction)

    if (!tenantId) {
      throw new Error(
        'Seed a portal tenant before seeding e2e legal documents.',
      )
    }

    const existingDocuments = await transaction
      .select({
        documentType: portalLegalDocuments.documentType,
      })
      .from(portalLegalDocuments)
      .where(
        and(
          eq(portalLegalDocuments.tenantId, tenantId),
          eq(portalLegalDocuments.status, 'active'),
        ),
      )
    const existingTypes = new Set(
      existingDocuments.map((document) => document.documentType),
    )
    const missingDocuments = E2E_LEGAL_DOCUMENTS.filter(
      ({ documentType }) => !existingTypes.has(documentType),
    )
    let insertedDocuments: Array<{ documentType: string }> = []

    if (missingDocuments.length > 0) {
      insertedDocuments = await transaction
        .insert(portalLegalDocuments)
        .values(
          missingDocuments.map((document) =>
            createSyntheticDocumentInput({
              ...document,
              tenantId,
            }),
          ),
        )
        .onConflictDoNothing()
        .returning({
          documentType: portalLegalDocuments.documentType,
        })
    }

    const activeDocuments = await transaction
      .select({
        documentType: portalLegalDocuments.documentType,
      })
      .from(portalLegalDocuments)
      .where(
        and(
          eq(portalLegalDocuments.tenantId, tenantId),
          eq(portalLegalDocuments.status, 'active'),
        ),
      )
    const activeTypes = new Set(
      activeDocuments.map((document) => document.documentType),
    )

    for (const { documentType } of E2E_LEGAL_DOCUMENTS) {
      if (!activeTypes.has(documentType)) {
        throw new Error(
          `Failed to seed the active ${documentType} document for e2e tests.`,
        )
      }
    }

    const insertedTypes = new Set(
      insertedDocuments.map((document) => document.documentType),
    )

    return {
      created: E2E_LEGAL_DOCUMENTS.filter(({ documentType }) =>
        insertedTypes.has(documentType),
      ).map(({ documentType }) => documentType),
      unchanged: E2E_LEGAL_DOCUMENTS.filter(
        ({ documentType }) => !insertedTypes.has(documentType),
      ).map(({ documentType }) => documentType),
    }
  })
}
