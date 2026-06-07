import type { FastifyInstance, FastifyRequest } from 'fastify'

import type { AppEnv } from '../../config/env.js'
import { assertAllowedTenantOrigin } from '../../lib/origin.js'
import type { TenantAdminAuthService } from '../tenant-admin/adminAuthService.js'
import { requireTenantAdminSession } from '../tenant-admin/adminSessionGuard.js'
import { requireTenantContext } from '../tenants/routes.js'
import type { BrandingService } from './service.js'

type RegisterBrandingRoutesOptions = {
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

export function registerBrandingRoutes(
  app: FastifyInstance,
  {
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
}
