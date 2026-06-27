import { and, desc, eq, sql } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import {
  portalLegalDocuments,
  portalLegalAcceptances,
  portalUserContactLinks,
  portalUsers,
} from '../../db/schema.js'
import { normalizeEmail } from '../../lib/email.js'

export function createPasswordlessLoginLegalRepository(
  db: AppDatabase,
  { tenantId }: { tenantId: number },
) {
  return {
    async findActiveCustomerAccessLegalDocumentVersions(
      executor: AppDatabase = db,
    ) {
      const documents = await executor
        .select({
          documentType: portalLegalDocuments.documentType,
          version: portalLegalDocuments.version,
        })
        .from(portalLegalDocuments)
        .where(
          and(
            eq(portalLegalDocuments.tenantId, tenantId),
            eq(portalLegalDocuments.status, 'active'),
          ),
        )

      const terms = documents.find(
        (document) => document.documentType === 'terms',
      )
      const privacy = documents.find(
        (document) => document.documentType === 'privacy',
      )

      if (!terms || !privacy) {
        return null
      }

      return {
        privacyPolicyVersion: privacy.version,
        termsVersion: terms.version,
      }
    },

    async createLegalAcceptance(
      {
        acceptedAt,
        email,
        personalDataConsentAccepted,
        portalUserId,
        privacyPolicyVersion,
        requestIp,
        termsAccepted,
        termsVersion,
        userAgent,
      }: {
        acceptedAt: Date
        email: string
        personalDataConsentAccepted: true
        portalUserId: number
        privacyPolicyVersion: string
        requestIp: string | null
        termsAccepted: true
        termsVersion: string
        userAgent: string | null
      },
      executor: AppDatabase = db,
    ) {
      const [createdRecord] = await executor
        .insert(portalLegalAcceptances)
        .values({
          acceptedAt,
          email: normalizeEmail(email),
          personalDataConsentAccepted,
          portalUserId,
          privacyPolicyVersion,
          purpose: 'customer_access',
          requestIp,
          tenantId,
          termsAccepted,
          termsVersion,
          userAgent,
        })
        .returning({
          id: portalLegalAcceptances.id,
        })

      if (!createdRecord) {
        throw new Error('Failed to create customer access legal acceptance.')
      }

      return createdRecord
    },

    async createPortalUser(
      {
        email,
        fullName,
      }: {
        email: string
        fullName?: string | null
      },
      executor: AppDatabase = db,
    ) {
      const normalizedEmail = normalizeEmail(email)
      const normalizedFullName = fullName?.trim() ? fullName.trim() : null

      const [createdUser] = await executor
        .insert(portalUsers)
        .values({
          email: normalizedEmail,
          fullName: normalizedFullName,
          passwordHash: null,
          tenantId,
        })
        .returning({
          email: portalUsers.email,
          fullName: portalUsers.fullName,
          id: portalUsers.id,
          isActive: portalUsers.isActive,
          passwordConfigured: sql<boolean>`${portalUsers.passwordHash} is not null`,
        })

      return createdUser ?? null
    },

    async createPortalUserContactLink(
      {
        chatwootContactId,
        userId,
      }: {
        chatwootContactId: number
        userId: number
      },
      executor: AppDatabase = db,
    ) {
      const [createdLink] = await executor
        .insert(portalUserContactLinks)
        .values({
          chatwootContactId,
          tenantId,
          userId,
        })
        .returning({
          id: portalUserContactLinks.id,
        })

      if (!createdLink) {
        throw new Error('Failed to create portal user contact link.')
      }

      return createdLink
    },

    async findLatestLegalAcceptanceForUser(
      {
        privacyPolicyVersion,
        termsVersion,
        userId,
      }: {
        privacyPolicyVersion?: string
        termsVersion?: string
        userId: number
      },
      executor: AppDatabase = db,
    ) {
      const [acceptance] = await executor
        .select({
          id: portalLegalAcceptances.id,
        })
        .from(portalLegalAcceptances)
        .where(
          and(
            eq(portalLegalAcceptances.tenantId, tenantId),
            eq(portalLegalAcceptances.portalUserId, userId),
            eq(portalLegalAcceptances.purpose, 'customer_access'),
            ...(termsVersion
              ? [eq(portalLegalAcceptances.termsVersion, termsVersion)]
              : []),
            ...(privacyPolicyVersion
              ? [
                  eq(
                    portalLegalAcceptances.privacyPolicyVersion,
                    privacyPolicyVersion,
                  ),
                ]
              : []),
          ),
        )
        .orderBy(
          desc(portalLegalAcceptances.acceptedAt),
          desc(portalLegalAcceptances.id),
        )
        .limit(1)

      return acceptance ?? null
    },
  }
}
