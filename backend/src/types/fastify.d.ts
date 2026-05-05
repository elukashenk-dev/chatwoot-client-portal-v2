import type { TenantRequestContext } from '../modules/tenants/service.js'

declare module 'fastify' {
  interface FastifyRequest {
    tenant: TenantRequestContext | null
  }
}
