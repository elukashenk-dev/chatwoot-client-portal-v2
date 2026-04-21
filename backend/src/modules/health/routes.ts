import type { FastifyInstance } from 'fastify'

import type { AppEnv } from '../../config/env.js'

type RegisterHealthRoutesOptions = {
  env: AppEnv
}

export function registerHealthRoutes(
  app: FastifyInstance,
  { env }: RegisterHealthRoutesOptions,
) {
  app.get('/api/health', async () => {
    return {
      app: 'chatwoot-client-portal-v2',
      environment: env.NODE_ENV,
      status: 'ok',
    }
  })
}
