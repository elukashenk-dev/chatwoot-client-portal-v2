import { describe, expect, it, vi } from 'vitest'

import type { PublicTenantAdmin } from '../tenant-admin/adminAuthService.js'
import { createLegalDocumentsService } from './service.js'
import type {
  ActivateLegalDocumentInput,
  ActiveLegalDocumentRow,
} from './repository.js'

const admin = {
  chatwootAgentId: 42,
  email: 'admin@example.test',
  role: 'administrator',
} satisfies PublicTenantAdmin

function createRow(
  input: ActivateLegalDocumentInput,
  overrides: Partial<ActiveLegalDocumentRow> = {},
): ActiveLegalDocumentRow {
  const now = new Date('2026-06-18T10:20:30.000Z')

  return {
    activatedAt: now,
    archivedAt: null,
    bodyText: input.bodyText,
    createdAt: now,
    documentType: input.documentType,
    id: overrides.id ?? 1,
    sourceByteSize: input.sourceByteSize,
    sourceContentType: input.sourceContentType,
    sourceFileName: input.sourceFileName,
    sourceSha256: input.sourceSha256,
    status: 'active',
    tenantId: 7,
    title: input.title,
    updatedAt: now,
    version: input.version,
    ...overrides,
  }
}

function createRepository() {
  let nextId = 1
  const documents: ActiveLegalDocumentRow[] = []

  return {
    activateDocument: vi.fn().mockImplementation(async (input) => {
      for (const document of documents) {
        if (
          document.documentType === input.documentType &&
          document.status === 'active'
        ) {
          document.status = 'archived'
          document.archivedAt = new Date('2026-06-18T10:20:30.000Z')
        }
      }

      const document = createRow(input, { id: nextId++ })
      documents.push(document)

      return document
    }),
    findActiveDocument: vi.fn().mockImplementation(async (documentType) => {
      return (
        documents.find(
          (document) =>
            document.documentType === documentType &&
            document.status === 'active',
        ) ?? null
      )
    }),
    findActiveDocuments: vi.fn().mockImplementation(async () => {
      return documents.filter((document) => document.status === 'active')
    }),
  }
}

async function expectToRejectWithApiCode(
  promise: Promise<unknown>,
  code: string,
) {
  await expect(promise).rejects.toMatchObject({ code })
}

describe('createLegalDocumentsService', () => {
  it('uploads TXT terms and returns a safe admin summary', async () => {
    const audit = vi.fn()
    const repository = createRepository()
    const service = createLegalDocumentsService({
      audit,
      now: () => new Date('2026-06-18T10:20:30.000Z'),
      repository,
    })

    const response = await service.uploadDocument({
      admin,
      documentType: 'terms',
      requestIp: '127.0.0.1',
      upload: {
        data: Buffer.from('Legal terms text for registration consent.'),
        fileName: '..\\terms.txt',
        mimeType: 'text/plain',
      },
      userAgent: 'vitest',
    })

    expect(repository.activateDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        bodyText: 'Legal terms text for registration consent.',
        documentType: 'terms',
        sourceContentType: 'text/plain',
        sourceFileName: 'terms.txt',
        sourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        title: 'Пользовательское соглашение',
        version: expect.stringMatching(
          /^20260618T102030000Z-[a-f0-9]{16}-[a-f0-9]{8}$/u,
        ),
      }),
    )
    expect(response).toEqual({
      document: expect.objectContaining({
        bodyCharacterCount: 42,
        documentType: 'terms',
        sourceFileName: 'terms.txt',
        title: 'Пользовательское соглашение',
      }),
    })
    expect(response.document).not.toHaveProperty('bodyText')
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'legal_document_uploaded',
        actor: admin,
        metadata: expect.objectContaining({
          documentType: 'terms',
          sourceFileName: 'terms.txt',
          version: response.document?.version,
        }),
        outcome: 'success',
        subjectEmail: admin.email,
      }),
    )
  })

  it('creates distinct versions for repeated uploads in the same second', async () => {
    const repository = createRepository()
    const service = createLegalDocumentsService({
      audit: vi.fn(),
      now: () => new Date('2026-06-18T10:20:30.000Z'),
      repository,
    })
    const upload = {
      data: Buffer.from('Legal terms text for repeated upload.'),
      fileName: 'terms.txt',
      mimeType: 'text/plain',
    }

    const first = await service.uploadDocument({
      admin,
      documentType: 'terms',
      requestIp: null,
      upload,
      userAgent: null,
    })
    const second = await service.uploadDocument({
      admin,
      documentType: 'terms',
      requestIp: null,
      upload,
      userAgent: null,
    })

    expect(first.document?.version).not.toBe(second.document?.version)
  })

  it('rejects unsupported document types before repository writes', () => {
    const repository = createRepository()
    const service = createLegalDocumentsService({
      audit: vi.fn(),
      repository,
    })

    expect(() => service.parseDocumentType('contract')).toThrow(
      expect.objectContaining({ code: 'LEGAL_DOCUMENT_NOT_FOUND' }),
    )
    expect(repository.activateDocument).not.toHaveBeenCalled()
  })

  it('returns the active public document body', async () => {
    const repository = createRepository()
    const service = createLegalDocumentsService({
      audit: vi.fn(),
      repository,
    })

    await service.uploadDocument({
      admin,
      documentType: 'privacy',
      requestIp: null,
      upload: {
        data: Buffer.from('Privacy policy text for registration consent.'),
        fileName: 'privacy.txt',
        mimeType: 'text/plain',
      },
      userAgent: null,
    })

    await expect(service.getPublicDocument('privacy')).resolves.toEqual({
      document: expect.objectContaining({
        bodyText: 'Privacy policy text for registration consent.',
        documentType: 'privacy',
        title: 'Политика обработки персональных данных',
      }),
    })
  })

  it('returns a controlled error when a public document is missing', async () => {
    const service = createLegalDocumentsService({
      audit: vi.fn(),
      repository: createRepository(),
    })

    await expectToRejectWithApiCode(
      service.getPublicDocument('terms'),
      'LEGAL_DOCUMENT_NOT_CONFIGURED',
    )
  })
})
