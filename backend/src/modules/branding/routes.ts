import type { MultipartFile } from '@fastify/multipart'
import type { FastifyInstance, FastifyRequest } from 'fastify'

import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../lib/errors.js'
import { assertAllowedTenantOrigin } from '../../lib/origin.js'
import type { TenantAdminAuthService } from '../tenant-admin/adminAuthService.js'
import { requireTenantAdminSession } from '../tenant-admin/adminSessionGuard.js'
import { requireTenantContext } from '../tenants/routes.js'
import {
  BRANDING_ASSET_MAX_BYTES,
  type BrandingAssetUpload,
} from './assetValidation.js'
import type { BrandingAssetService } from './assetService.js'
import {
  parseBrandingAssetId,
  parseBrandingAssetKind,
  type BrandingAssetKind,
} from './brandingAssets.js'
import type { BrandingService } from './service.js'

const BRANDING_ASSET_REQUEST_OVERHEAD_BYTES = 128 * 1024
const BRANDING_ASSET_REQUEST_MAX_BYTES =
  BRANDING_ASSET_MAX_BYTES + BRANDING_ASSET_REQUEST_OVERHEAD_BYTES

type RegisterBrandingRoutesOptions = {
  createBrandingAssetService: (request: FastifyRequest) => BrandingAssetService
  createBrandingService: (request: FastifyRequest) => BrandingService
  createTenantAdminAuthService: (
    request: FastifyRequest,
  ) => TenantAdminAuthService
  env: AppEnv
}

function getUserAgent(request: FastifyRequest) {
  const userAgent = request.headers['user-agent']

  return typeof userAgent === 'string' ? userAgent : null
}

async function readBrandingAssetFile({
  kind,
  part,
}: {
  kind: BrandingAssetKind
  part: MultipartFile
}): Promise<BrandingAssetUpload> {
  if (part.fieldname !== 'asset') {
    throw new ApiError(
      400,
      'BRANDING_ASSET_FIELD_INVALID',
      'Файл нужно передать в поле asset.',
    )
  }

  return {
    data: await part.toBuffer(),
    fileName: part.filename,
    kind,
    mimeType: part.mimetype,
  }
}

function toBrandingMultipartApiError(app: FastifyInstance, error: unknown) {
  if (error instanceof ApiError) {
    return error
  }

  if (error instanceof app.multipartErrors.RequestFileTooLargeError) {
    return new ApiError(
      413,
      'BRANDING_ASSET_TOO_LARGE',
      'Файл брендинга должен быть не больше 5 МБ.',
    )
  }

  if (
    error instanceof app.multipartErrors.FilesLimitError ||
    error instanceof app.multipartErrors.FieldsLimitError ||
    error instanceof app.multipartErrors.PartsLimitError
  ) {
    return new ApiError(
      400,
      'BRANDING_ASSET_REQUEST_INVALID',
      'Можно загрузить только один файл брендинга.',
    )
  }

  if (error instanceof app.multipartErrors.InvalidMultipartContentTypeError) {
    return new ApiError(
      415,
      'BRANDING_ASSET_MULTIPART_REQUIRED',
      'Файл нужно отправить как multipart/form-data.',
    )
  }

  return null
}

async function parseBrandingAssetUpload({
  app,
  kind,
  request,
}: {
  app: FastifyInstance
  kind: BrandingAssetKind
  request: FastifyRequest
}) {
  if (!request.isMultipart()) {
    throw new ApiError(
      415,
      'BRANDING_ASSET_MULTIPART_REQUIRED',
      'Файл нужно отправить как multipart/form-data.',
    )
  }

  let upload: BrandingAssetUpload | null = null

  try {
    const parts = request.parts({
      limits: {
        fields: 0,
        fileSize: BRANDING_ASSET_MAX_BYTES,
        files: 1,
        parts: 1,
      },
    })

    for await (const part of parts) {
      if (part.type === 'field' || upload) {
        throw new ApiError(
          400,
          'BRANDING_ASSET_REQUEST_INVALID',
          'Можно загрузить только один файл брендинга.',
        )
      }

      upload = await readBrandingAssetFile({ kind, part })
    }
  } catch (error) {
    const apiError = toBrandingMultipartApiError(app, error)

    if (apiError) {
      throw apiError
    }

    throw error
  }

  if (!upload) {
    throw new ApiError(
      400,
      'BRANDING_ASSET_FILE_REQUIRED',
      'Выберите файл брендинга.',
    )
  }

  return upload
}

export function registerBrandingRoutes(
  app: FastifyInstance,
  {
    createBrandingAssetService,
    createBrandingService,
    createTenantAdminAuthService,
    env,
  }: RegisterBrandingRoutesOptions,
) {
  app.get('/api/branding', async (request) => {
    requireTenantContext(request)

    return createBrandingService(request).getPublicBranding()
  })

  app.get('/api/admin/branding', async (request, reply) => {
    requireTenantContext(request)
    await requireTenantAdminSession({
      createTenantAdminAuthService,
      env,
      reply,
      request,
    })

    return createBrandingService(request).getAdminBranding()
  })

  app.patch('/api/admin/branding', async (request, reply) => {
    assertAllowedTenantOrigin(request)
    requireTenantContext(request)
    const session = await requireTenantAdminSession({
      createTenantAdminAuthService,
      env,
      reply,
      request,
    })

    return createBrandingService(request).updateAdminBranding({
      admin: session.admin,
      input: request.body,
      requestIp: request.ip || null,
      userAgent: getUserAgent(request),
    })
  })

  app.post<{ Params: { kind: string } }>(
    '/api/admin/branding/assets/:kind',
    { bodyLimit: BRANDING_ASSET_REQUEST_MAX_BYTES },
    async (request, reply) => {
      assertAllowedTenantOrigin(request)
      requireTenantContext(request)
      const session = await requireTenantAdminSession({
        createTenantAdminAuthService,
        env,
        reply,
        request,
      })
      const kind = parseBrandingAssetKind(request.params.kind)
      const upload = await parseBrandingAssetUpload({ app, kind, request })

      return createBrandingAssetService(request).uploadAsset({
        admin: session.admin,
        requestIp: request.ip || null,
        upload,
        userAgent: getUserAgent(request),
      })
    },
  )

  app.delete<{ Params: { kind: string } }>(
    '/api/admin/branding/assets/:kind',
    async (request, reply) => {
      assertAllowedTenantOrigin(request)
      requireTenantContext(request)
      const session = await requireTenantAdminSession({
        createTenantAdminAuthService,
        env,
        reply,
        request,
      })
      const kind = parseBrandingAssetKind(request.params.kind)

      return createBrandingAssetService(request).deleteAsset({
        admin: session.admin,
        kind,
        requestIp: request.ip || null,
        userAgent: getUserAgent(request),
      })
    },
  )

  app.get<{ Params: { assetId: string } }>(
    '/api/branding/assets/:assetId',
    async (request, reply) => {
      requireTenantContext(request)
      const asset = await createBrandingAssetService(request).getPublicAsset({
        assetId: parseBrandingAssetId(request.params.assetId),
      })

      if (!asset.body) {
        throw new ApiError(
          404,
          'BRANDING_ASSET_NOT_FOUND',
          'Файл брендинга не найден.',
        )
      }

      reply.header('cache-control', 'public, max-age=31536000, immutable')
      reply.header('x-content-type-options', 'nosniff')
      reply.header('content-type', asset.contentType)

      if (asset.contentLength !== null) {
        reply.header('content-length', String(asset.contentLength))
      }

      return reply.send(asset.body)
    },
  )
}
