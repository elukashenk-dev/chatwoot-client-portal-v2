import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { ApiError } from '../../lib/errors.js'
import type { TenantRequestContext, TenantsService } from './service.js'

type RegisterTenantContextOptions = {
  tenantsService: TenantsService
}

type RegisterTenantRoutesOptions = {
  tenantsService: Pick<TenantsService, 'getPublicTenantContext'>
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

function getTenantPwaIconVersion(tenant: TenantRequestContext) {
  return encodeURIComponent(`${tenant.slug}-${tenantPwaFallbackIconVersion}`)
}

function getTenantPwaManifest(tenant: TenantRequestContext) {
  const iconVersion = getTenantPwaIconVersion(tenant)

  return {
    background_color: tenantPwaBackgroundColor,
    description: `Личный кабинет ${tenant.displayName} для безопасной работы с сообщениями и обращениями.`,
    display: 'standalone',
    icons: [
      {
        purpose: 'any',
        sizes: '192x192',
        src: `/api/tenant/icons/icon-192.png?v=${iconVersion}`,
        type: 'image/png',
      },
      {
        purpose: 'any',
        sizes: '512x512',
        src: `/api/tenant/icons/icon-512.png?v=${iconVersion}`,
        type: 'image/png',
      },
      {
        purpose: 'maskable',
        sizes: '512x512',
        src: `/api/tenant/icons/icon-maskable-512.png?v=${iconVersion}`,
        type: 'image/png',
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
  { tenantsService }: RegisterTenantRoutesOptions,
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

    setTenantPwaHeaders(reply)

    return reply
      .type('application/manifest+json; charset=utf-8')
      .send(getTenantPwaManifest(tenant))
  })

  app.get('/api/tenant/apple-touch-icon.png', async (request, reply) => {
    requireTenantContext(request)
    setTenantPwaHeaders(reply)

    return reply.status(302).header('Location', '/apple-touch-icon.png').send()
  })

  app.get<{
    Params: {
      iconName: string
    }
  }>('/api/tenant/icons/:iconName', async (request, reply) => {
    requireTenantContext(request)
    setTenantPwaHeaders(reply)

    const iconPath =
      tenantPwaIconRedirects[
        request.params.iconName as keyof typeof tenantPwaIconRedirects
      ]

    if (!iconPath) {
      throw new ApiError(404, 'TENANT_PWA_ICON_NOT_FOUND', 'Иконка не найдена.')
    }

    return reply.status(302).header('Location', iconPath).send()
  })
}
