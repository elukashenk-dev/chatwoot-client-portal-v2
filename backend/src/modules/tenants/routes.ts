import type { FastifyInstance, FastifyRequest } from 'fastify'

import { ApiError } from '../../lib/errors.js'
import type { TenantRequestContext, TenantsService } from './service.js'

type RegisterTenantContextOptions = {
  tenantsService: TenantsService
}

type RegisterTenantRoutesOptions = {
  tenantsService: Pick<TenantsService, 'getPublicTenantContext'>
}

const tenantOptionalPaths = new Set(['/api/health'])
const tenantPublicPaths = new Set(['/api/tenant'])
const customerRuntimePathPrefixes = [
  '/api/auth/',
  '/api/chat/',
  '/api/chatwoot/webhooks',
  '/api/integrations/chatwoot/webhooks',
]

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

function requiresDefaultTenantRuntime(pathname: string) {
  if (tenantPublicPaths.has(pathname)) {
    return false
  }

  return customerRuntimePathPrefixes.some((prefix) =>
    pathname.startsWith(prefix),
  )
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

    if (requiresDefaultTenantRuntime(pathname)) {
      tenantsService.assertDefaultTenantRuntime(tenant)
    }
  })
}

export function registerTenantRoutes(
  app: FastifyInstance,
  { tenantsService }: RegisterTenantRoutesOptions,
) {
  app.get('/api/tenant', async (request) => {
    const tenant = requireTenantContext(request)

    return {
      tenant: tenantsService.getPublicTenantContext(tenant),
    }
  })
}
