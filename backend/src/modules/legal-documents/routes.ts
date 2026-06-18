import type { MultipartFile } from '@fastify/multipart'
import type { FastifyInstance, FastifyRequest } from 'fastify'

import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../lib/errors.js'
import { assertAllowedTenantOrigin } from '../../lib/origin.js'
import type { TenantAdminAuthService } from '../tenant-admin/adminAuthService.js'
import { requireTenantAdminSession } from '../tenant-admin/adminSessionGuard.js'
import { requireTenantContext } from '../tenants/routes.js'
import {
  LEGAL_DOCUMENT_MAX_BYTES,
  LEGAL_DOCUMENT_REQUEST_MAX_BYTES,
  type LegalDocumentUpload,
} from './legalDocumentTypes.js'
import type { LegalDocumentsService } from './service.js'

type RegisterLegalDocumentRoutesOptions = {
  createLegalDocumentsService: (
    request: FastifyRequest,
  ) => LegalDocumentsService
  createTenantAdminAuthService: (
    request: FastifyRequest,
  ) => TenantAdminAuthService
  env: AppEnv
}

function getUserAgent(request: FastifyRequest) {
  const userAgent = request.headers['user-agent']

  return typeof userAgent === 'string' ? userAgent : null
}

async function readLegalDocumentFile(
  part: MultipartFile,
): Promise<LegalDocumentUpload> {
  if (part.fieldname !== 'document') {
    throw new ApiError(
      400,
      'LEGAL_DOCUMENT_FIELD_INVALID',
      'Файл нужно передать в поле document.',
    )
  }

  return {
    data: await part.toBuffer(),
    fileName: part.filename,
    mimeType: part.mimetype,
  }
}

function toLegalDocumentMultipartApiError(
  app: FastifyInstance,
  error: unknown,
) {
  if (error instanceof ApiError) {
    return error
  }

  if (error instanceof app.multipartErrors.RequestFileTooLargeError) {
    return new ApiError(
      413,
      'LEGAL_DOCUMENT_TOO_LARGE',
      'Документ должен быть не больше 10 МБ.',
    )
  }

  if (
    error instanceof app.multipartErrors.FilesLimitError ||
    error instanceof app.multipartErrors.FieldsLimitError ||
    error instanceof app.multipartErrors.PartsLimitError
  ) {
    return new ApiError(
      400,
      'LEGAL_DOCUMENT_REQUEST_INVALID',
      'Можно загрузить только один юридический документ.',
    )
  }

  if (error instanceof app.multipartErrors.InvalidMultipartContentTypeError) {
    return new ApiError(
      415,
      'LEGAL_DOCUMENT_MULTIPART_REQUIRED',
      'Документ нужно отправить как multipart/form-data.',
    )
  }

  return null
}

async function parseLegalDocumentUpload({
  app,
  request,
}: {
  app: FastifyInstance
  request: FastifyRequest
}) {
  if (!request.isMultipart()) {
    throw new ApiError(
      415,
      'LEGAL_DOCUMENT_MULTIPART_REQUIRED',
      'Документ нужно отправить как multipart/form-data.',
    )
  }

  let upload: LegalDocumentUpload | null = null

  try {
    const parts = request.parts({
      limits: {
        fields: 0,
        fileSize: LEGAL_DOCUMENT_MAX_BYTES,
        files: 1,
        parts: 1,
      },
    })

    for await (const part of parts) {
      if (part.type === 'field' || upload) {
        throw new ApiError(
          400,
          'LEGAL_DOCUMENT_REQUEST_INVALID',
          'Можно загрузить только один юридический документ.',
        )
      }

      upload = await readLegalDocumentFile(part)
    }
  } catch (error) {
    const apiError = toLegalDocumentMultipartApiError(app, error)

    if (apiError) {
      throw apiError
    }

    throw error
  }

  if (!upload) {
    throw new ApiError(
      400,
      'LEGAL_DOCUMENT_FILE_REQUIRED',
      'Выберите юридический документ.',
    )
  }

  return upload
}

export function registerLegalDocumentRoutes(
  app: FastifyInstance,
  {
    createLegalDocumentsService,
    createTenantAdminAuthService,
    env,
  }: RegisterLegalDocumentRoutesOptions,
) {
  app.get<{ Params: { documentType: string } }>(
    '/api/legal-documents/:documentType',
    async (request) => {
      requireTenantContext(request)
      const service = createLegalDocumentsService(request)
      const documentType = service.parseDocumentType(
        request.params.documentType,
      )

      return service.getPublicDocument(documentType)
    },
  )

  app.get('/api/admin/legal-documents', async (request, reply) => {
    requireTenantContext(request)
    await requireTenantAdminSession({
      createTenantAdminAuthService,
      env,
      reply,
      request,
    })

    return createLegalDocumentsService(request).getAdminDocuments()
  })

  app.post<{ Params: { documentType: string } }>(
    '/api/admin/legal-documents/:documentType',
    { bodyLimit: LEGAL_DOCUMENT_REQUEST_MAX_BYTES },
    async (request, reply) => {
      assertAllowedTenantOrigin(request)
      requireTenantContext(request)
      const session = await requireTenantAdminSession({
        createTenantAdminAuthService,
        env,
        reply,
        request,
      })
      const service = createLegalDocumentsService(request)
      const documentType = service.parseDocumentType(
        request.params.documentType,
      )
      const upload = await parseLegalDocumentUpload({ app, request })

      return service.uploadDocument({
        admin: session.admin,
        documentType,
        requestIp: request.ip || null,
        upload,
        userAgent: getUserAgent(request),
      })
    },
  )
}
