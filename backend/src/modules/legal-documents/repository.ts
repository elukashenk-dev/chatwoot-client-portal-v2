import { createHash } from 'node:crypto'

import { and, eq, sql } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import { portalLegalDocuments } from '../../db/schema.js'
import type { LegalDocumentType } from './legalDocumentTypes.js'

export type ActiveLegalDocumentRow = typeof portalLegalDocuments.$inferSelect

export type ActivateLegalDocumentInput = {
  bodyText: string
  documentType: LegalDocumentType
  sourceByteSize: number
  sourceContentType: string
  sourceFileName: string
  sourceSha256: string
  title: string
  version: string
}

function createLegalDocumentLockKey(
  tenantId: number,
  documentType: LegalDocumentType,
) {
  const digest = createHash('sha256')
    .update(`legal-document:${tenantId}:${documentType}`)
    .digest()

  return [digest.readInt32BE(0), digest.readInt32BE(4)] as const
}

export function createLegalDocumentsRepository(
  db: AppDatabase,
  { tenantId }: { tenantId: number },
) {
  return {
    async findActiveDocument(documentType: LegalDocumentType) {
      const [document] = await db
        .select()
        .from(portalLegalDocuments)
        .where(
          and(
            eq(portalLegalDocuments.tenantId, tenantId),
            eq(portalLegalDocuments.documentType, documentType),
            eq(portalLegalDocuments.status, 'active'),
          ),
        )
        .limit(1)

      return document ?? null
    },

    async findActiveDocuments() {
      return db
        .select()
        .from(portalLegalDocuments)
        .where(
          and(
            eq(portalLegalDocuments.tenantId, tenantId),
            eq(portalLegalDocuments.status, 'active'),
          ),
        )
        .orderBy(portalLegalDocuments.documentType)
    },

    async activateDocument(input: ActivateLegalDocumentInput) {
      const now = new Date()
      const [lockKeyPartOne, lockKeyPartTwo] = createLegalDocumentLockKey(
        tenantId,
        input.documentType,
      )

      return db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(${lockKeyPartOne}, ${lockKeyPartTwo})`,
        )

        await tx
          .update(portalLegalDocuments)
          .set({
            archivedAt: now,
            status: 'archived',
            updatedAt: now,
          })
          .where(
            and(
              eq(portalLegalDocuments.tenantId, tenantId),
              eq(portalLegalDocuments.documentType, input.documentType),
              eq(portalLegalDocuments.status, 'active'),
            ),
          )

        const [document] = await tx
          .insert(portalLegalDocuments)
          .values({
            ...input,
            activatedAt: now,
            status: 'active',
            tenantId,
            updatedAt: now,
          })
          .returning()

        if (!document) {
          throw new Error('Failed to activate legal document.')
        }

        return document
      })
    },
  }
}

export type LegalDocumentsRepository = ReturnType<
  typeof createLegalDocumentsRepository
>
