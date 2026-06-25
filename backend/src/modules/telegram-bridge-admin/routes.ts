import type { FastifyInstance, FastifyRequest } from 'fastify'

import type { AppEnv } from '../../config/env.js'
import { assertAllowedTenantOrigin } from '../../lib/origin.js'
import type { TenantAdminAuthService } from '../tenant-admin/adminAuthService.js'
import { requireTenantAdminSession } from '../tenant-admin/adminSessionGuard.js'
import { requireTenantContext } from '../tenants/routes.js'
import { parseTelegramBridgeSetupInput } from './input.js'
import type { TenantTelegramBridgeSetupService } from './service.js'

type RegisterTelegramBridgeAdminRoutesOptions = {
  createTelegramBridgeSetupService: (
    request: FastifyRequest,
  ) => TenantTelegramBridgeSetupService
  createTenantAdminAuthService: (
    request: FastifyRequest,
  ) => TenantAdminAuthService
  env: AppEnv
}

function getUserAgent(request: FastifyRequest) {
  const userAgent = request.headers['user-agent']

  return typeof userAgent === 'string' ? userAgent : null
}

export function registerTelegramBridgeAdminRoutes(
  app: FastifyInstance,
  {
    createTelegramBridgeSetupService,
    createTenantAdminAuthService,
    env,
  }: RegisterTelegramBridgeAdminRoutesOptions,
) {
  app.post(
    '/api/admin/integrations/telegram-bridge/setup',
    async (request, reply) => {
      assertAllowedTenantOrigin(request)
      requireTenantContext(request)
      const session = await requireTenantAdminSession({
        createTenantAdminAuthService,
        env,
        reply,
        request,
      })
      const input = parseTelegramBridgeSetupInput(request.body)
      const bridge = await createTelegramBridgeSetupService(
        request,
      ).setupTelegramBridge({
        admin: session.admin,
        input,
        requestIp: request.ip || null,
        userAgent: getUserAgent(request),
      })

      return {
        bridge,
      }
    },
  )
}
