import { ApiError } from '../../lib/errors.js'
import type { PublicTenantAdmin } from '../tenant-admin/adminAuthService.js'
import {
  createLegalDocumentSourceSha256,
  createLegalDocumentVersion,
  extractLegalDocumentText,
  sanitizeLegalDocumentContentType,
  sanitizeLegalDocumentSourceFileName,
} from './documentParser.js'
import {
  legalDocumentTitles,
  legalDocumentTypes,
  type LegalDocumentType,
  type LegalDocumentUpload,
} from './legalDocumentTypes.js'
import type { LegalDocumentsRepository } from './repository.js'

type LegalAudit = (input: {
  action: string
  actor?: PublicTenantAdmin | null
  metadata?: Record<string, unknown>
  outcome: string
  requestIp: string | null
  subjectEmail?: string | null
  userAgent: string | null
}) => Promise<void> | void

function assertLegalDocumentType(value: string): LegalDocumentType {
  if (legalDocumentTypes.includes(value as LegalDocumentType)) {
    return value as LegalDocumentType
  }

  throw new ApiError(404, 'LEGAL_DOCUMENT_NOT_FOUND', 'Документ не найден.')
}

function toSummary(
  document: Awaited<ReturnType<LegalDocumentsRepository['findActiveDocument']>>,
) {
  if (!document) {
    return null
  }

  return {
    activatedAt: document.activatedAt.toISOString(),
    bodyCharacterCount: document.bodyText.length,
    documentType: document.documentType as LegalDocumentType,
    sourceContentType: document.sourceContentType,
    sourceFileName: document.sourceFileName,
    sourceSha256: document.sourceSha256,
    title: document.title,
    version: document.version,
  }
}

export function createLegalDocumentsService({
  audit,
  now = () => new Date(),
  repository,
}: {
  audit: LegalAudit
  now?: () => Date
  repository: LegalDocumentsRepository
}) {
  return {
    parseDocumentType: assertLegalDocumentType,

    async getPublicDocument(documentType: LegalDocumentType) {
      const document = await repository.findActiveDocument(documentType)

      if (!document) {
        throw new ApiError(
          404,
          'LEGAL_DOCUMENT_NOT_CONFIGURED',
          'Документ пока не загружен.',
        )
      }

      return {
        document: {
          bodyText: document.bodyText,
          documentType,
          title: document.title,
          version: document.version,
        },
      }
    },

    async getAdminDocuments() {
      const activeDocuments = await repository.findActiveDocuments()
      const summaries = Object.fromEntries(
        activeDocuments.map((document) => [
          document.documentType,
          toSummary(document),
        ]),
      )

      return {
        documents: {
          privacy: summaries.privacy ?? null,
          terms: summaries.terms ?? null,
        },
      }
    },

    async uploadDocument({
      admin,
      documentType,
      requestIp,
      upload,
      userAgent,
    }: {
      admin: PublicTenantAdmin
      documentType: LegalDocumentType
      requestIp: string | null
      upload: LegalDocumentUpload
      userAgent: string | null
    }) {
      const bodyText = await extractLegalDocumentText(upload)
      const sourceSha256 = createLegalDocumentSourceSha256(upload.data)
      const document = await repository.activateDocument({
        bodyText,
        documentType,
        sourceByteSize: upload.data.byteLength,
        sourceContentType: sanitizeLegalDocumentContentType(upload.mimeType),
        sourceFileName: sanitizeLegalDocumentSourceFileName(upload.fileName),
        sourceSha256,
        title: legalDocumentTitles[documentType],
        version: createLegalDocumentVersion({
          at: now(),
          sourceSha256,
        }),
      })

      await audit({
        action: 'legal_document_uploaded',
        actor: admin,
        metadata: {
          bodyCharacterCount: document.bodyText.length,
          documentType,
          sourceByteSize: document.sourceByteSize,
          sourceContentType: document.sourceContentType,
          sourceFileName: document.sourceFileName,
          sourceSha256: document.sourceSha256,
          version: document.version,
        },
        outcome: 'success',
        requestIp,
        subjectEmail: admin.email,
        userAgent,
      })

      return { document: toSummary(document) }
    },

    async getActiveVersionsForRegistration() {
      const [terms, privacy] = await Promise.all([
        repository.findActiveDocument('terms'),
        repository.findActiveDocument('privacy'),
      ])

      if (!terms || !privacy) {
        throw new ApiError(
          503,
          'LEGAL_DOCUMENTS_NOT_CONFIGURED',
          'Регистрация временно недоступна: юридические документы еще не загружены.',
        )
      }

      return {
        privacyPolicyVersion: privacy.version,
        termsVersion: terms.version,
      }
    },
  }
}

export type LegalDocumentsService = ReturnType<
  typeof createLegalDocumentsService
>
