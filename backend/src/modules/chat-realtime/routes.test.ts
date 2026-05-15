import cookie from '@fastify/cookie'
import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'

import { registerApiErrorHandler } from '../../lib/errors.js'
import { testEnv } from '../../test/appTestHelpers.js'
import type { AuthService } from '../auth/service.js'
import type { ChatThreadsService } from '../chat-threads/service.js'
import type { CurrentUserChatThreadContext } from '../chat-threads/types.js'
import type { TenantRequestContext } from '../tenants/service.js'
import {
  CHAT_REALTIME_MAX_SUBSCRIPTIONS_PER_KEY,
  createChatRealtimeHub,
} from './hub.js'
import { registerChatRealtimeRoutes } from './routes.js'

const tenant: TenantRequestContext = {
  chatwoot: {
    accountId: 1,
    apiAccessToken: 'test-api-token',
    baseUrl: 'https://chatwoot.example.test',
    portalInboxId: 1,
    webhookSecret: 'test-webhook-secret',
  },
  displayName: 'Local Test Tenant',
  id: 1,
  isDefault: true,
  primaryDomain: 'localhost',
  publicBaseUrl: testEnv.APP_ORIGIN,
  slug: 'default',
  status: 'active',
}

const readyContext: CurrentUserChatThreadContext = {
  activeThread: {
    id: 'private:me',
    subtitle: 'Только вы и поддержка',
    title: 'Личный чат',
    type: 'private',
  },
  chatwootConversation: {
    assigneeName: null,
    id: 101,
    inboxId: 1,
    lastActivityAt: 1_776_000_000,
    status: 'open',
  },
  currentUserEmail: 'user@example.test',
  currentUserName: 'Portal User',
  linkedContactId: 44,
  portalChatThreadId: 1,
  reason: 'none',
  result: 'ready',
  targetChatwootContactId: 44,
  threadType: 'private',
}

const companyReadyContext: CurrentUserChatThreadContext = {
  activeThread: {
    id: 'company:154',
    subtitle: 'Общий чат компании',
    title: 'ООО "Ромашка"',
    type: 'company',
  },
  chatwootConversation: {
    assigneeName: null,
    id: 301,
    inboxId: 1,
    lastActivityAt: 1_776_000_000,
    status: 'open',
  },
  currentUserEmail: 'user@example.test',
  currentUserName: 'Portal User',
  linkedContactId: 44,
  portalChatThreadId: 2,
  reason: 'none',
  result: 'ready',
  targetChatwootContactId: 154,
  threadType: 'company',
}

function createNotReadyContext(
  reason: CurrentUserChatThreadContext['reason'],
  threadType: CurrentUserChatThreadContext['threadType'] = 'company',
): CurrentUserChatThreadContext {
  return {
    activeThread: null,
    chatwootConversation: null,
    currentUserEmail: 'user@example.test',
    currentUserName: 'Portal User',
    linkedContactId: 44,
    portalChatThreadId: null,
    reason,
    result: 'not_ready',
    targetChatwootContactId: threadType === 'company' ? 999 : null,
    threadType,
  }
}

async function buildRealtimeRoutesTestApp({
  context = readyContext,
}: {
  context?: CurrentUserChatThreadContext
} = {}) {
  const app = Fastify({ logger: false })
  const realtimeHub = createChatRealtimeHub()
  const authService = {
    getCurrentUser: vi.fn(async () => ({
      email: 'user@example.test',
      fullName: 'Portal User',
      id: 7,
    })),
  } as unknown as AuthService
  const chatThreadsService = {
    getCurrentUserThreadContext: vi.fn(async () => context),
  } as unknown as Pick<ChatThreadsService, 'getCurrentUserThreadContext'>

  app.register(cookie, {
    hook: 'onRequest',
    secret: testEnv.SESSION_SECRET,
  })
  app.decorateRequest('tenant', null)
  app.addHook('onRequest', async (request) => {
    request.tenant = tenant
  })
  registerApiErrorHandler(app)
  registerChatRealtimeRoutes(app, {
    authService,
    createChatThreadsService: () => chatThreadsService,
    env: testEnv,
    realtimeHub,
  })
  await app.ready()

  return {
    app,
    chatThreadsService,
    realtimeHub,
  }
}

function createAuthorizedCookie(app: ReturnType<typeof Fastify>) {
  return `${testEnv.SESSION_COOKIE_NAME}=${app.signCookie('session-token')}`
}

describe('registerChatRealtimeRoutes', () => {
  it('rejects forged company thread ids through thread access validation before subscribing', async () => {
    const { app, chatThreadsService, realtimeHub } =
      await buildRealtimeRoutesTestApp({
        context: createNotReadyContext('thread_access_denied'),
      })
    const subscribeSpy = vi.spyOn(realtimeHub, 'subscribe')

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'GET',
        url: '/api/chat/realtime?threadId=company%3A999',
      })

      expect(response.statusCode).toBe(409)
      expect(response.json()).toEqual({
        error: {
          code: 'chat_realtime_not_ready',
          details: {
            reason: 'thread_access_denied',
          },
          message: 'Realtime доступен только для готового чата.',
        },
      })
      expect(
        chatThreadsService.getCurrentUserThreadContext,
      ).toHaveBeenCalledWith({
        threadId: 'company:999',
        userId: 7,
      })
      expect(subscribeSpy).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  it('rejects malformed company thread ids through thread validation before subscribing', async () => {
    const { app, chatThreadsService, realtimeHub } =
      await buildRealtimeRoutesTestApp({
        context: createNotReadyContext('thread_invalid', null),
      })
    const subscribeSpy = vi.spyOn(realtimeHub, 'subscribe')

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'GET',
        url: '/api/chat/realtime?threadId=company%3Anot-a-number',
      })

      expect(response.statusCode).toBe(409)
      expect(response.json()).toEqual({
        error: {
          code: 'chat_realtime_not_ready',
          details: {
            reason: 'thread_invalid',
          },
          message: 'Realtime доступен только для готового чата.',
        },
      })
      expect(
        chatThreadsService.getCurrentUserThreadContext,
      ).toHaveBeenCalledWith({
        threadId: 'company:not-a-number',
        userId: 7,
      })
      expect(subscribeSpy).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  it('rejects a new company SSE subscription after membership is removed', async () => {
    const { app, chatThreadsService, realtimeHub } =
      await buildRealtimeRoutesTestApp({
        context: createNotReadyContext('thread_access_denied'),
      })
    const subscribeSpy = vi.spyOn(realtimeHub, 'subscribe')

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'GET',
        url: '/api/chat/realtime?threadId=company%3A154',
      })

      expect(response.statusCode).toBe(409)
      expect(
        chatThreadsService.getCurrentUserThreadContext,
      ).toHaveBeenCalledWith({
        threadId: 'company:154',
        userId: 7,
      })
      expect(subscribeSpy).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  it('returns 429 before opening an SSE stream when the per chat subscription cap is reached', async () => {
    const { app, realtimeHub } = await buildRealtimeRoutesTestApp({
      context: companyReadyContext,
    })

    for (
      let index = 0;
      index < CHAT_REALTIME_MAX_SUBSCRIPTIONS_PER_KEY;
      index += 1
    ) {
      expect(
        realtimeHub.subscribe({
          send: vi.fn(),
          tenantId: tenant.id,
          threadId: 'company:154',
          userId: 7,
        }).status,
      ).toBe('subscribed')
    }

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'GET',
        url: '/api/chat/realtime?threadId=company%3A154',
      })

      expect(response.statusCode).toBe(429)
      expect(response.json()).toEqual({
        error: {
          code: 'CHAT_REALTIME_SUBSCRIPTION_LIMIT_EXCEEDED',
          message: 'Открыто слишком много realtime-подключений к этому чату.',
        },
      })
    } finally {
      await app.close()
    }
  })
})
