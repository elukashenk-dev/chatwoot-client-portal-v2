import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from './app.js'
import type { DatabaseClient } from './db/client.js'
import {
  seedDefaultTenant,
  testEnv,
} from './test/appTestHelpers.js'
import { createTestDatabase } from './test/testDatabase.js'

describe('Telegram bridge admin app routes', () => {
  let app: FastifyInstance
  let database: DatabaseClient

  beforeEach(async () => {
    database = await createTestDatabase()
    await seedDefaultTenant(database)
    app = buildApp({
      database,
      env: {
        ...testEnv,
        TELEGRAM_BRIDGE_PUBLIC_BASE_URL: 'https://app.lancora.ru',
      },
    })
  })

  afterEach(async () => {
    await app.close()
  })

  it('registers the protected tenant admin setup route', async () => {
    const response = await app.inject({
      headers: {
        host: 'localhost',
        origin: testEnv.APP_ORIGIN,
      },
      method: 'POST',
      payload: {
        chatwootInboxUrl:
          'https://app.lancora.ru/app/accounts/1/settings/inboxes/17',
        telegramBotToken: '1234567890:AASecretBotTokenValue',
      },
      url: '/api/admin/integrations/telegram-bridge/setup',
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({
      error: {
        code: 'TENANT_ADMIN_UNAUTHORIZED',
      },
    })
  })
})
