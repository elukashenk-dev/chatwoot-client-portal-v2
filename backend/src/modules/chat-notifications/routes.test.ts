import cookie from '@fastify/cookie'
import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'

import { registerApiErrorHandler } from '../../lib/errors.js'
import { testEnv } from '../../test/appTestHelpers.js'
import type { AuthService } from '../auth/service.js'
import type { TenantRequestContext } from '../tenants/service.js'
import type { PushSubscriptionService } from './pushSubscriptionService.js'
import { registerChatNotificationRoutes } from './routes.js'
import type { ChatNotificationsService } from './service.js'

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

function createAuthorizedCookie(app: ReturnType<typeof Fastify>) {
  return `${testEnv.SESSION_COOKIE_NAME}=${app.signCookie('session-token')}`
}

async function buildNotificationsRoutesTestApp({
  pushService,
  service,
}: {
  pushService?: Partial<PushSubscriptionService>
  service?: Partial<ChatNotificationsService>
} = {}) {
  const app = Fastify({ logger: false })
  const authService = {
    getCurrentUser: vi.fn(async () => ({
      email: 'user@example.test',
      fullName: 'Portal User',
      id: 7,
    })),
  } as unknown as AuthService
  const notificationsService = {
    getGlobalSettings: vi.fn(async () => ({
      newMessagesEnabled: true,
      pushEnabled: false,
      soundEnabled: true,
    })),
    getSettings: vi.fn(async () => ({
      effective: {
        newMessagesEnabled: true,
        pushEnabled: false,
        soundEnabled: true,
      },
      global: {
        newMessagesEnabled: true,
        pushEnabled: false,
        soundEnabled: true,
      },
      overrides: {
        newMessagesEnabled: null,
        pushEnabled: null,
        soundEnabled: null,
      },
      threadId: 'private:me',
    })),
    updateGlobalSettings: vi.fn(async ({ patch }) => ({
      newMessagesEnabled: patch.newMessagesEnabled ?? true,
      pushEnabled: patch.pushEnabled ?? false,
      soundEnabled: patch.soundEnabled ?? true,
    })),
    updateSettings: vi.fn(async ({ patch, threadId }) => ({
      effective: {
        newMessagesEnabled: patch.newMessagesEnabled ?? true,
        pushEnabled: patch.pushEnabled ?? false,
        soundEnabled: patch.soundEnabled ?? true,
      },
      global: {
        newMessagesEnabled: true,
        pushEnabled: false,
        soundEnabled: true,
      },
      overrides: {
        newMessagesEnabled: patch.newMessagesEnabled ?? null,
        pushEnabled: patch.pushEnabled ?? null,
        soundEnabled: patch.soundEnabled ?? null,
      },
      threadId,
    })),
    ...service,
  } as ChatNotificationsService
  const subscriptionService = {
    disableSubscription: vi.fn(async () => undefined),
    getPublicKey: vi.fn(() => ({
      available: false,
    })),
    saveSubscription: vi.fn(async () => undefined),
    ...pushService,
  } as PushSubscriptionService

  app.register(cookie, {
    hook: 'onRequest',
    secret: testEnv.SESSION_SECRET,
  })
  app.decorateRequest('tenant', null)
  app.addHook('onRequest', async (request) => {
    request.tenant = tenant
  })
  registerApiErrorHandler(app)
  registerChatNotificationRoutes(app, {
    authService,
    createChatNotificationsService: () => notificationsService,
    createPushSubscriptionService: () => subscriptionService,
    env: testEnv,
  })
  await app.ready()

  return {
    app,
    notificationsService,
    subscriptionService,
  }
}

describe('registerChatNotificationRoutes', () => {
  it('returns global notification settings for the current user', async () => {
    const { app, notificationsService } =
      await buildNotificationsRoutesTestApp()

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'GET',
        url: '/api/notifications/settings',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        newMessagesEnabled: true,
        pushEnabled: false,
        soundEnabled: true,
      })
      expect(notificationsService.getGlobalSettings).toHaveBeenCalledWith({
        portalUserId: 7,
      })
    } finally {
      await app.close()
    }
  })

  it('updates global notification settings', async () => {
    const { app, notificationsService } =
      await buildNotificationsRoutesTestApp()

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
          origin: testEnv.APP_ORIGIN,
        },
        method: 'PATCH',
        payload: {
          pushEnabled: true,
        },
        url: '/api/notifications/settings',
      })

      expect(response.statusCode).toBe(200)
      expect(notificationsService.updateGlobalSettings).toHaveBeenCalledWith({
        patch: { pushEnabled: true },
        portalUserId: 7,
      })
    } finally {
      await app.close()
    }
  })

  it('returns chat notification settings with decoded thread id', async () => {
    const { app, notificationsService } =
      await buildNotificationsRoutesTestApp()

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'GET',
        url: '/api/chat/threads/private%3Ame/notification-settings',
      })

      expect(response.statusCode).toBe(200)
      expect(notificationsService.getSettings).toHaveBeenCalledWith({
        portalUserId: 7,
        threadId: 'private:me',
      })
    } finally {
      await app.close()
    }
  })

  it('updates chat overrides and allows null reset values', async () => {
    const { app, notificationsService } =
      await buildNotificationsRoutesTestApp()

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
          origin: testEnv.APP_ORIGIN,
        },
        method: 'PATCH',
        payload: {
          newMessagesEnabled: null,
          pushEnabled: true,
          soundEnabled: null,
        },
        url: '/api/chat/threads/group%3A155/notification-settings',
      })

      expect(response.statusCode).toBe(200)
      expect(notificationsService.updateSettings).toHaveBeenCalledWith({
        patch: {
          newMessagesEnabled: null,
          pushEnabled: true,
          soundEnabled: null,
        },
        portalUserId: 7,
        threadId: 'group:155',
      })
    } finally {
      await app.close()
    }
  })

  it('returns the push public key state', async () => {
    const { app, subscriptionService } = await buildNotificationsRoutesTestApp({
      pushService: {
        getPublicKey: vi.fn(() => ({
          available: true,
          publicKey: 'public-key',
          publicKeyFingerprint: 'sha256-fingerprint',
          vapidKeyId: 'sha256-key',
        })),
      },
    })

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'GET',
        url: '/api/notifications/push/public-key',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        available: true,
        publicKey: 'public-key',
        publicKeyFingerprint: 'sha256-fingerprint',
        vapidKeyId: 'sha256-key',
      })
      expect(subscriptionService.getPublicKey).toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  it('saves a browser push subscription for the current user', async () => {
    const { app, subscriptionService } = await buildNotificationsRoutesTestApp()

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
          origin: testEnv.APP_ORIGIN,
          'user-agent': 'Test Browser',
        },
        method: 'POST',
        payload: {
          deviceId: 'portal-device-test-device-1',
          endpoint: 'https://fcm.googleapis.com/fcm/send/subscription-1',
          keys: {
            auth: 'auth-secret',
            p256dh: 'p256dh-key',
          },
        },
        url: '/api/notifications/push/subscriptions',
      })

      expect(response.statusCode).toBe(204)
      expect(subscriptionService.saveSubscription).toHaveBeenCalledWith({
        portalUserId: 7,
        subscription: {
          deviceId: 'portal-device-test-device-1',
          endpoint: 'https://fcm.googleapis.com/fcm/send/subscription-1',
          keys: {
            auth: 'auth-secret',
            p256dh: 'p256dh-key',
          },
          userAgent: 'Test Browser',
        },
      })
    } finally {
      await app.close()
    }
  })

  it('rejects unlisted public browser push subscription origins', async () => {
    const { app, subscriptionService } = await buildNotificationsRoutesTestApp()

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
          origin: testEnv.APP_ORIGIN,
        },
        method: 'POST',
        payload: {
          endpoint: 'https://attacker.example.test/subscription/1',
          keys: {
            auth: 'auth-secret',
            p256dh: 'p256dh-key',
          },
        },
        url: '/api/notifications/push/subscriptions',
      })

      expect(response.statusCode).toBe(400)
      expect(subscriptionService.saveSubscription).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  it.each([
    ['http endpoint', 'http://push.example.test/subscription/1'],
    ['localhost endpoint', 'https://localhost/subscription/1'],
    ['private ipv4 endpoint', 'https://192.168.1.10/subscription/1'],
    ['loopback ipv6 endpoint', 'https://[::1]/subscription/1'],
    [
      'mapped private ipv6 endpoint',
      'https://[::ffff:127.0.0.1]/subscription/1',
    ],
  ])('rejects unsafe browser push subscription %s', async (_, endpoint) => {
    const { app, subscriptionService } = await buildNotificationsRoutesTestApp()

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
          origin: testEnv.APP_ORIGIN,
        },
        method: 'POST',
        payload: {
          endpoint,
          keys: {
            auth: 'auth-secret',
            p256dh: 'p256dh-key',
          },
        },
        url: '/api/notifications/push/subscriptions',
      })

      expect(response.statusCode).toBe(400)
      expect(subscriptionService.saveSubscription).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  it('disables the current browser push subscription', async () => {
    const { app, subscriptionService } = await buildNotificationsRoutesTestApp()

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
          origin: testEnv.APP_ORIGIN,
        },
        method: 'DELETE',
        payload: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/subscription-1',
        },
        url: '/api/notifications/push/subscriptions',
      })

      expect(response.statusCode).toBe(204)
      expect(subscriptionService.disableSubscription).toHaveBeenCalledWith({
        endpoint: 'https://fcm.googleapis.com/fcm/send/subscription-1',
        portalUserId: 7,
      })
    } finally {
      await app.close()
    }
  })
})
