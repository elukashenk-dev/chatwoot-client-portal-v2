import type { FastifyRequest } from 'fastify'

import type { AppEnv } from '../../config/env.js'
import type { DatabaseClient } from '../../db/client.js'
import {
  createChatwootFetch,
  normalizeChatwootRequestTimeoutMs,
  readChatwootJson,
} from '../../integrations/chatwoot/request.js'
import { ApiError } from '../../lib/errors.js'
import {
  createTelegramClient,
  getTelegramBotIdentity,
} from '../../telegram-bridge/telegramClient.js'
import { createTenantAdminAuditLogger } from '../tenant-admin/adminAuthAudit.js'
import { createTenantAdminAuthRepository } from '../tenant-admin/adminAuthRepository.js'
import { requireTenantContext } from '../tenants/routes.js'
import type { TenantRequestContext } from '../tenants/service.js'
import { createTenantTelegramBridgeSetupService } from './service.js'

type BridgeHealthVerifierOptions = {
  fetchFn?: typeof fetch
  publicBaseUrl: string
  requestTimeoutMs: number
}

type ChatwootTelegramInboxReaderOptions = {
  fetchFn?: typeof fetch
  requestTimeoutMs: number
}

type CreateTelegramBridgeSetupServiceForTenantRequestOptions = {
  chatwootFetchFn?: typeof fetch
  database: DatabaseClient
  env: AppEnv
  request: FastifyRequest
  telegramFetchFn?: typeof fetch
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizePublicBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '')
}

function setupUnavailable(message: string) {
  return new ApiError(502, 'TELEGRAM_BRIDGE_UPSTREAM_FAILED', message)
}

function readBotName(payload: Record<string, unknown>) {
  const topLevelBotName = readString(payload.bot_name)

  if (topLevelBotName) {
    return topLevelBotName
  }

  const channel = isPlainObject(payload.channel) ? payload.channel : null

  return channel ? readString(channel.bot_name) : null
}

export function parseChatwootTelegramInboxResponse(
  payload: unknown,
  expectedInboxId: number,
) {
  const inbox = isPlainObject(payload) ? payload : null
  const id = inbox ? readInteger(inbox.id) : null

  if (!inbox || id !== expectedInboxId) {
    throw new ApiError(
      400,
      'TELEGRAM_BRIDGE_INBOX_NOT_FOUND',
      'Telegram-источник не найден в системе поддержки.',
    )
  }

  if (readString(inbox.channel_type) !== 'Channel::Telegram') {
    throw new ApiError(
      400,
      'TELEGRAM_BRIDGE_INBOX_NOT_TELEGRAM',
      'Выбранный источник не является Telegram-источником.',
    )
  }

  const botName = readBotName(inbox)

  if (!botName) {
    throw new ApiError(
      400,
      'TELEGRAM_BRIDGE_INBOX_BOT_NAME_MISSING',
      'Telegram-источник не содержит bot_name.',
    )
  }

  return {
    botName,
    id,
  }
}

export function createBridgeHealthVerifier({
  fetchFn = fetch,
  publicBaseUrl,
  requestTimeoutMs,
}: BridgeHealthVerifierOptions) {
  const healthUrl = new URL(
    '/telegram-bridge/health',
    normalizePublicBaseUrl(publicBaseUrl),
  )

  return async function verifyBridgeHealth() {
    const abortController = new AbortController()
    const timeout = setTimeout(
      () => abortController.abort(new Error('Telegram bridge health timed out.')),
      requestTimeoutMs,
    )

    try {
      const response = await fetchFn(healthUrl, {
        method: 'GET',
        signal: abortController.signal,
      })

      if (!response.ok) {
        throw new Error(
          `Telegram bridge health check failed with status ${response.status}.`,
        )
      }
    } catch (error) {
      if (error instanceof ApiError) {
        throw error
      }

      throw setupUnavailable(
        error instanceof Error
          ? error.message
          : 'Telegram bridge health check failed.',
      )
    } finally {
      clearTimeout(timeout)
    }
  }
}

export function createChatwootTelegramInboxReader({
  fetchFn = fetch,
  requestTimeoutMs,
}: ChatwootTelegramInboxReaderOptions) {
  const fetchChatwoot = createChatwootFetch({
    fetchFn,
    requestTimeoutMs,
  })

  return async function readChatwootTelegramInbox({
    inboxId,
    tenant,
  }: {
    inboxId: number
    tenant: TenantRequestContext
  }) {
    const requestUrl = new URL(
      `/api/v1/accounts/${tenant.chatwoot.accountId}/inboxes/${inboxId}`,
      tenant.chatwoot.baseUrl,
    )
    const request = await fetchChatwoot(
      requestUrl,
      'Telegram-источник системы поддержки недоступен.',
      {
        headers: {
          Accept: 'application/json',
          api_access_token: tenant.chatwoot.apiAccessToken,
        },
        method: 'GET',
      },
    )

    try {
      if (request.response.status === 404) {
        throw new ApiError(
          400,
          'TELEGRAM_BRIDGE_INBOX_NOT_FOUND',
          'Telegram-источник не найден в системе поддержки.',
        )
      }

      if (!request.response.ok) {
        throw new ApiError(
          400,
          'TELEGRAM_BRIDGE_INBOX_LOOKUP_FAILED',
          `Не удалось проверить Telegram-источник в системе поддержки. Status: ${request.response.status}.`,
        )
      }

      const payload = await readChatwootJson({
        invalidJsonMessage:
          'Telegram-источник системы поддержки вернул некорректный JSON.',
        request,
        unavailableMessage:
          'Telegram-источник системы поддержки недоступен.',
      })

      return parseChatwootTelegramInboxResponse(payload, inboxId)
    } finally {
      request.clearTimeout()
    }
  }
}

export function createTelegramBridgeSetupServiceForTenantRequest({
  chatwootFetchFn,
  database,
  env,
  request,
  telegramFetchFn,
}: CreateTelegramBridgeSetupServiceForTenantRequestOptions) {
  const tenant = requireTenantContext(request)
  const publicBaseUrl = tenant.publicBaseUrl
  const requestTimeoutMs = env.TELEGRAM_BRIDGE_REQUEST_TIMEOUT_MS
  const adminAuthRepository = createTenantAdminAuthRepository(database.db, {
    tenantId: tenant.id,
  })
  const telegramClientOptions = {
    ...(telegramFetchFn ? { fetchFn: telegramFetchFn } : {}),
    requestTimeoutMs,
  }

  return createTenantTelegramBridgeSetupService({
    audit: createTenantAdminAuditLogger(adminAuthRepository),
    db: database.db,
    getTelegramBotIdentity: (botToken) =>
      getTelegramBotIdentity(botToken, telegramClientOptions),
    readChatwootTelegramInbox: createChatwootTelegramInboxReader({
      ...(chatwootFetchFn ? { fetchFn: chatwootFetchFn } : {}),
      requestTimeoutMs: normalizeChatwootRequestTimeoutMs(
        env.CHATWOOT_REQUEST_TIMEOUT_MS,
      ),
    }),
    telegramClientFactory: (botToken) =>
      createTelegramClient({
        botToken,
        ...telegramClientOptions,
      }),
    tenant,
    tenantSecretKey: env.PORTAL_TENANT_SECRET_KEY ?? '',
    verifyBridgeHealth: createBridgeHealthVerifier({
      ...(telegramFetchFn ? { fetchFn: telegramFetchFn } : {}),
      publicBaseUrl,
      requestTimeoutMs,
    }),
  })
}
