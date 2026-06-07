import type { Readable } from 'node:stream'

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { ApiError } from '../../lib/errors.js'
import { createTenantPwaIconVersion } from '../branding/brandingAssets.js'
import type { TenantRequestContext, TenantsService } from './service.js'

type RegisterTenantContextOptions = {
  tenantsService: Pick<TenantsService, 'resolveTenantByHost'>
}

type RegisterTenantRoutesOptions = {
  pwaIconReader?: TenantPwaIconReader
  tenantsService: Pick<TenantsService, 'getPublicTenantContext'>
}

export type TenantPwaIconReader = {
  getActivePwaIconMetadata(request: FastifyRequest): Promise<{
    assetId: number
    contentType: string
  } | null>
  getActivePwaIconObject(
    request: FastifyRequest,
    expectedAssetId: number,
  ): Promise<{
    assetId: number
    body: Readable | null
    contentLength: number | null
    contentType: string
  } | null>
}

const tenantOptionalPaths = new Set(['/api/health'])
const tenantPwaThemeColor = '#112540'
const tenantPwaBackgroundColor = '#f3f7fc'
const tenantPwaFallbackIconVersion = 'fallback-v1'
const tenantPwaIconRedirects = {
  'icon-192.png': '/pwa-icons/icon-192.png',
  'icon-512.png': '/pwa-icons/icon-512.png',
  'icon-maskable-512.png': '/pwa-icons/icon-maskable-512.png',
} as const

function getRequestPathname(request: FastifyRequest) {
  try {
    return new URL(request.url, 'http://portal.local').pathname
  } catch {
    throw new ApiError(400, 'REQUEST_URL_INVALID', 'Некорректный URL запроса.')
  }
}

function getRequestQueryValue(request: FastifyRequest, key: string) {
  try {
    return new URL(request.url, 'http://portal.local').searchParams.get(key)
  } catch {
    throw new ApiError(400, 'REQUEST_URL_INVALID', 'Некорректный URL запроса.')
  }
}

function requiresTenantResolution(pathname: string) {
  return pathname.startsWith('/api/') && !tenantOptionalPaths.has(pathname)
}

function setTenantPwaHeaders(reply: FastifyReply) {
  reply.header('Cache-Control', 'no-store')
  reply.header('Vary', 'Host')
}

function getTenantPwaRootUrl(tenant: TenantRequestContext) {
  return new URL('/', tenant.publicBaseUrl).href
}

function getTenantPwaIconVersion(
  tenant: TenantRequestContext,
  pwaIconMetadata?: { assetId: number } | null,
) {
  if (pwaIconMetadata) {
    return createTenantPwaIconVersion({
      assetId: pwaIconMetadata.assetId,
      tenantSlug: tenant.slug,
    })
  }

  return encodeURIComponent(`${tenant.slug}-${tenantPwaFallbackIconVersion}`)
}

function getTenantPwaManifest(
  tenant: TenantRequestContext,
  pwaIconMetadata?: { assetId: number; contentType: string } | null,
) {
  const iconVersion = getTenantPwaIconVersion(tenant, pwaIconMetadata)
  const iconType = pwaIconMetadata?.contentType ?? 'image/png'

  return {
    background_color: tenantPwaBackgroundColor,
    description: `Личный кабинет ${tenant.displayName} для безопасной работы с сообщениями и обращениями.`,
    display: 'standalone',
    icons: [
      {
        purpose: 'any',
        sizes: '192x192',
        src: `/api/tenant/icons/icon-192.png?v=${iconVersion}`,
        type: iconType,
      },
      {
        purpose: 'any',
        sizes: '512x512',
        src: `/api/tenant/icons/icon-512.png?v=${iconVersion}`,
        type: iconType,
      },
      {
        purpose: 'maskable',
        sizes: '512x512',
        src: `/api/tenant/icons/icon-maskable-512.png?v=${iconVersion}`,
        type: iconType,
      },
    ],
    id: getTenantPwaRootUrl(tenant),
    lang: 'ru',
    name: `${tenant.displayName} Личный кабинет`,
    scope: '/',
    short_name: tenant.displayName,
    start_url: '/',
    theme_color: tenantPwaThemeColor,
  }
}

async function sendActiveTenantPwaIconIfPresent({
  pwaIconReader,
  reply,
  requireMatchingVersion,
  request,
}: {
  pwaIconReader: TenantPwaIconReader | undefined
  reply: FastifyReply
  requireMatchingVersion: boolean
  request: FastifyRequest
}) {
  if (!pwaIconReader) {
    return false
  }

  const tenant = requireTenantContext(request)
  const metadata = await pwaIconReader.getActivePwaIconMetadata(request)

  if (!metadata) {
    return false
  }

  const activeVersion = getTenantPwaIconVersion(tenant, metadata)
  const requestedVersion = getRequestQueryValue(request, 'v')

  if (requireMatchingVersion && requestedVersion !== activeVersion) {
    setTenantPwaHeaders(reply)

    await reply.status(404).send({
      error: {
        code: 'TENANT_PWA_ICON_NOT_FOUND',
        message: 'Иконка приложения не найдена.',
      },
    })

    return true
  }

  const icon = await pwaIconReader.getActivePwaIconObject(
    request,
    metadata.assetId,
  )

  if (!icon) {
    return false
  }

  if (icon.assetId !== metadata.assetId) {
    setTenantPwaHeaders(reply)

    await reply.status(404).send({
      error: {
        code: 'TENANT_PWA_ICON_NOT_FOUND',
        message: 'Иконка приложения не найдена.',
      },
    })

    return true
  }

  if (!icon.body) {
    throw new ApiError(
      404,
      'TENANT_PWA_ICON_NOT_FOUND',
      'Иконка приложения не найдена.',
    )
  }

  if (requestedVersion === activeVersion) {
    reply.header('Cache-Control', 'public, max-age=31536000, immutable')
    reply.header('Vary', 'Host')
  } else {
    setTenantPwaHeaders(reply)
  }

  reply.header('X-Content-Type-Options', 'nosniff')
  reply.type(icon.contentType)

  if (icon.contentLength !== null) {
    reply.header('content-length', String(icon.contentLength))
  }

  await reply.send(icon.body)

  return true
}

export function requireTenantContext(
  request: FastifyRequest,
): TenantRequestContext {
  if (!request.tenant) {
    throw new ApiError(
      500,
      'TENANT_CONTEXT_MISSING',
      'Tenant context is missing.',
    )
  }

  return request.tenant
}

export function registerTenantContext(
  app: FastifyInstance,
  { tenantsService }: RegisterTenantContextOptions,
) {
  app.decorateRequest('tenant', null)

  app.addHook('onRequest', async (request) => {
    const pathname = getRequestPathname(request)

    if (!requiresTenantResolution(pathname)) {
      return
    }

    const tenant = await tenantsService.resolveTenantByHost({
      host: request.hostname,
    })

    request.tenant = tenant
  })
}

export function registerTenantRoutes(
  app: FastifyInstance,
  { pwaIconReader, tenantsService }: RegisterTenantRoutesOptions,
) {
  app.get('/api/tenant', async (request, reply) => {
    const tenant = requireTenantContext(request)

    setTenantPwaHeaders(reply)

    return {
      tenant: tenantsService.getPublicTenantContext(tenant),
    }
  })

  app.get('/api/tenant/manifest.webmanifest', async (request, reply) => {
    const tenant = requireTenantContext(request)
    const pwaIconMetadata =
      (await pwaIconReader?.getActivePwaIconMetadata(request)) ?? null

    setTenantPwaHeaders(reply)

    return reply
      .type('application/manifest+json; charset=utf-8')
      .send(getTenantPwaManifest(tenant, pwaIconMetadata))
  })

  app.get('/api/tenant/apple-touch-icon.png', async (request, reply) => {
    requireTenantContext(request)

    if (
      await sendActiveTenantPwaIconIfPresent({
        pwaIconReader,
        reply,
        requireMatchingVersion: false,
        request,
      })
    ) {
      return
    }

    setTenantPwaHeaders(reply)

    return reply.status(302).header('Location', '/apple-touch-icon.png').send()
  })

  app.get<{
    Params: {
      iconName: string
    }
  }>('/api/tenant/icons/:iconName', async (request, reply) => {
    requireTenantContext(request)

    const iconPath =
      tenantPwaIconRedirects[
        request.params.iconName as keyof typeof tenantPwaIconRedirects
      ]

    if (!iconPath) {
      throw new ApiError(404, 'TENANT_PWA_ICON_NOT_FOUND', 'Иконка не найдена.')
    }

    if (
      await sendActiveTenantPwaIconIfPresent({
        pwaIconReader,
        reply,
        requireMatchingVersion: true,
        request,
      })
    ) {
      return
    }

    setTenantPwaHeaders(reply)

    return reply.status(302).header('Location', iconPath).send()
  })
}
