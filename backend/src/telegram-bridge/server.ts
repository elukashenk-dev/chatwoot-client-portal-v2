import Fastify from 'fastify'

import { createDatabaseClient, type DatabaseClient } from '../db/client.js'
import { runDatabaseMigrations } from '../db/migrate.js'
import { createChatwootFetch } from '../integrations/chatwoot/request.js'
import { loadTelegramBridgeEnv, type TelegramBridgeEnv } from './env.js'
import { createChatwootBridgeClient } from './chatwootBridgeClient.js'
import { createTelegramBridgeConfigRepository } from './configRepository.js'
import {
  createTelegramBridgeService,
  type HandleTelegramUpdateInput,
  type TelegramBridgeResult,
  type TelegramBridgeServiceTexts,
} from './service.js'
import { createTelegramClient } from './telegramClient.js'
import { createTelegramBridgeUpdateDedupeRepository } from './updateDedupeRepository.js'

const telegramSecretHeader = 'x-telegram-bot-api-secret-token'

type TelegramBridgeHandler = (
  input: HandleTelegramUpdateInput,
) => Promise<TelegramBridgeResult>

type BuildTelegramBridgeAppOptions = {
  handleTelegramUpdate: TelegramBridgeHandler
  logger?: boolean
  maxBodyBytes: number
}

type StartTelegramBridgeServerOptions = {
  env?: TelegramBridgeEnv
  fetchFn?: typeof fetch
}

type TelegramBridgeServiceTextEnv = Pick<
  TelegramBridgeEnv,
  | 'TELEGRAM_BRIDGE_PHONE_LINKED_TEXT'
  | 'TELEGRAM_BRIDGE_PHONE_NOT_FOUND_TEXT'
  | 'TELEGRAM_BRIDGE_PHONE_PROMPT_TEXT'
>

function genericError(code: string, message: string) {
  return {
    error: {
      code,
      message,
    },
  }
}

function readTelegramSecretHeader(value: unknown) {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' && value[0].trim()
      ? value[0]
      : null
  }

  return typeof value === 'string' && value.trim() ? value : null
}

function isJsonContentType(value: unknown) {
  if (typeof value !== 'string') {
    return false
  }

  return value.toLowerCase().split(';', 1)[0]?.trim() === 'application/json'
}

function readErrorStatusCode(error: unknown) {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) {
    return null
  }

  const statusCode = (error as { statusCode?: unknown }).statusCode

  return typeof statusCode === 'number' ? statusCode : null
}

function mapBridgeResult(result: TelegramBridgeResult) {
  if (result.kind === 'accepted') {
    return {
      body: { result: 'accepted' },
      statusCode: 200,
    }
  }

  if (result.kind === 'duplicate') {
    return {
      body: { result: 'duplicate' },
      statusCode: 200,
    }
  }

  if (result.kind === 'retryable_failure') {
    return {
      body: { result: 'retryable_failure' },
      statusCode: result.statusCode,
    }
  }

  if (result.reason === 'unauthorized') {
    return {
      body: genericError('not_found', 'Not found.'),
      statusCode: 404,
    }
  }

  if (result.reason === 'forbidden') {
    return {
      body: genericError('forbidden', 'Forbidden.'),
      statusCode: 403,
    }
  }

  return {
    body: { result: 'ignored' },
    statusCode: 200,
  }
}

export function createTelegramBridgeServiceTextsFromEnv(
  env: TelegramBridgeServiceTextEnv,
): TelegramBridgeServiceTexts {
  return {
    phoneLinked: env.TELEGRAM_BRIDGE_PHONE_LINKED_TEXT,
    phoneNotFound: env.TELEGRAM_BRIDGE_PHONE_NOT_FOUND_TEXT,
    phonePrompt: env.TELEGRAM_BRIDGE_PHONE_PROMPT_TEXT,
  }
}

function createTelegramBridgeHandler({
  database,
  env,
  fetchFn = fetch,
}: {
  database: DatabaseClient
  env: TelegramBridgeEnv
  fetchFn?: typeof fetch
}): TelegramBridgeHandler {
  const fetchChatwoot = createChatwootFetch({
    fetchFn,
    requestTimeoutMs: env.TELEGRAM_BRIDGE_REQUEST_TIMEOUT_MS,
  })
  const service = createTelegramBridgeService({
    configRepository: createTelegramBridgeConfigRepository(database.db, {
      tenantSecretKey: env.PORTAL_TENANT_SECRET_KEY,
    }),
    createChatwootClient: (config) =>
      createChatwootBridgeClient({
        config: {
          accountId: config.chatwoot.accountId,
          apiAccessToken: config.chatwoot.apiAccessToken,
          baseUrl: config.chatwoot.baseUrl,
          botToken: config.telegram.botToken,
          telegramInboxId: config.chatwootTelegramInboxId,
        },
        fetchChatwoot,
      }),
    createTelegramClient: (config) =>
      createTelegramClient({
        botToken: config.telegram.botToken,
        fetchFn,
        requestTimeoutMs: env.TELEGRAM_BRIDGE_REQUEST_TIMEOUT_MS,
    }),
    dedupeRepository: createTelegramBridgeUpdateDedupeRepository(database.db),
    staleProcessingMs: env.TELEGRAM_BRIDGE_PROCESSING_STALE_MS,
    texts: createTelegramBridgeServiceTextsFromEnv(env),
  })

  return service.handleTelegramUpdate
}

export function buildTelegramBridgeApp({
  handleTelegramUpdate,
  logger = false,
  maxBodyBytes,
}: BuildTelegramBridgeAppOptions) {
  const app = Fastify({
    bodyLimit: maxBodyBytes,
    logger,
  })

  app.setNotFoundHandler(async (_request, reply) => {
    return reply.code(404).send(genericError('not_found', 'Not found.'))
  })

  app.setErrorHandler(async (error, _request, reply) => {
    const statusCode = readErrorStatusCode(error)

    if (statusCode === 413) {
      return reply
        .code(413)
        .send(genericError('payload_too_large', 'Payload too large.'))
    }

    if (statusCode === 415) {
      return reply
        .code(415)
        .send(
          genericError('unsupported_media_type', 'Unsupported media type.'),
        )
    }

    if (statusCode === 400) {
      return reply.code(400).send(genericError('bad_request', 'Bad request.'))
    }

    return reply
      .code(500)
      .send(genericError('internal_error', 'Internal server error.'))
  })

  app.get('/telegram-bridge/health', async () => ({
    status: 'ok',
  }))

  app.post<{
    Body: HandleTelegramUpdateInput['update']
    Params: {
      bridgeKey: string
      webhookPathSecret: string
    }
  }>(
    '/telegram-bridge/:bridgeKey/:webhookPathSecret',
    {
      onRequest: async (request, reply) => {
        const telegramSecretToken = readTelegramSecretHeader(
          request.headers[telegramSecretHeader],
        )

        if (!telegramSecretToken) {
          return reply.code(403).send(genericError('forbidden', 'Forbidden.'))
        }

        if (!isJsonContentType(request.headers['content-type'])) {
          return reply
            .code(415)
            .send(
              genericError(
                'unsupported_media_type',
                'Unsupported media type.',
              ),
            )
        }
      },
    },
    async (request, reply) => {
      const telegramSecretToken = readTelegramSecretHeader(
        request.headers[telegramSecretHeader],
      )
      const result = await handleTelegramUpdate({
        bridgeKey: request.params.bridgeKey,
        telegramSecretToken,
        update: request.body,
        webhookPathSecret: request.params.webhookPathSecret,
      })
      const response = mapBridgeResult(result)

      return reply.code(response.statusCode).send(response.body)
    },
  )

  return app
}

export async function startTelegramBridgeServer({
  env = loadTelegramBridgeEnv(),
  fetchFn = fetch,
}: StartTelegramBridgeServerOptions = {}) {
  const database = createDatabaseClient({
    connectionString: env.DATABASE_URL,
  })
  let app: ReturnType<typeof buildTelegramBridgeApp> | null = null

  try {
    await runDatabaseMigrations(database.db)

    app = buildTelegramBridgeApp({
      handleTelegramUpdate: createTelegramBridgeHandler({
        database,
        env,
        fetchFn,
      }),
      logger: true,
      maxBodyBytes: env.TELEGRAM_BRIDGE_MAX_BODY_BYTES,
    })

    app.addHook('onClose', async () => {
      await database.close()
    })

    await app.listen({
      host: '0.0.0.0',
      port: env.TELEGRAM_BRIDGE_PORT,
    })

    return app
  } catch (error) {
    if (app) {
      app.log.error(error)
      await app.close()
    } else {
      console.error(error)
      await database.close()
    }

    throw error
  }
}

function isDirectRun() {
  const entrypoint = process.argv[1] ?? ''

  return (
    entrypoint.endsWith('/telegram-bridge/server.ts') ||
    entrypoint.endsWith('/telegram-bridge/server.js')
  )
}

if (isDirectRun()) {
  startTelegramBridgeServer().catch(() => {
    process.exit(1)
  })
}
