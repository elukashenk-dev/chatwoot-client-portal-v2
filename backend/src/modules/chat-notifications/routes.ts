import { isIP } from 'node:net'

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import type { AppEnv } from '../../config/env.js'
import { assertAllowedTenantOrigin } from '../../lib/origin.js'
import { resolveAuthenticatedPortalUser } from '../auth/currentUser.js'
import type { AuthService } from '../auth/service.js'
import type { PushSubscriptionService } from './pushSubscriptionService.js'
import type { ChatNotificationsService } from './service.js'
import type {
  ChatNotificationOverrides,
  UserNotificationSettings,
} from './types.js'

type RegisterChatNotificationRoutesOptions = {
  authService: AuthService
  createChatNotificationsService: (
    request: FastifyRequest,
  ) => ChatNotificationsService
  createPushSubscriptionService: (
    request: FastifyRequest,
  ) => PushSubscriptionService
  env: AppEnv
}

const publicThreadIdSchema = z.string().trim().min(1).max(80)

const threadParamsSchema = z
  .object({
    threadId: publicThreadIdSchema,
  })
  .strict()

const userNotificationSettingsPatchSchema = z
  .object({
    newMessagesEnabled: z.boolean().optional(),
    pushEnabled: z.boolean().optional(),
    soundEnabled: z.boolean().optional(),
  })
  .strict()

const chatNotificationSettingsPatchSchema = z
  .object({
    newMessagesEnabled: z.boolean().nullable().optional(),
    pushEnabled: z.boolean().nullable().optional(),
    soundEnabled: z.boolean().nullable().optional(),
  })
  .strict()

function isPrivateIpv4(hostname: string) {
  const octets = hostname.split('.').map((part) => Number(part))

  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false
  }

  const [first = 0, second = 0] = octets

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  )
}

function isPrivateIpv6(hostname: string) {
  const normalizedHostname = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  const ipv4MappedAddress = normalizedHostname.match(/^::ffff:(.+)$/)

  if (ipv4MappedAddress) {
    return true
  }

  return (
    normalizedHostname === '::1' ||
    normalizedHostname.startsWith('fe80:') ||
    normalizedHostname.startsWith('fc') ||
    normalizedHostname.startsWith('fd')
  )
}

function normalizeAllowedOrigins(allowedOrigins: string[] | undefined) {
  return new Set(
    (allowedOrigins ?? []).map((origin) => {
      try {
        return new URL(origin).origin
      } catch {
        return origin
      }
    }),
  )
}

function isSafePushEndpoint(value: string, allowedOrigins: Set<string>) {
  try {
    const url = new URL(value)
    const hostname = url.hostname.replace(/\.$/, '').toLowerCase()

    if (url.protocol !== 'https:') {
      return false
    }

    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
      return false
    }

    const ipVersion = isIP(hostname.replace(/^\[|\]$/g, ''))

    if (ipVersion === 4) {
      return !isPrivateIpv4(hostname) && allowedOrigins.has(url.origin)
    }

    if (ipVersion === 6) {
      return !isPrivateIpv6(hostname) && allowedOrigins.has(url.origin)
    }

    return allowedOrigins.has(url.origin)
  } catch {
    return false
  }
}

function createPushEndpointSchema(allowedOrigins: Set<string>) {
  return z
    .string()
    .trim()
    .url()
    .max(4096)
    .refine((value) => isSafePushEndpoint(value, allowedOrigins), {
      message: 'Некорректный endpoint push-уведомлений.',
    })
}

function createPushSubscriptionBodySchema(allowedOrigins: Set<string>) {
  return z
    .object({
      endpoint: createPushEndpointSchema(allowedOrigins),
      keys: z
        .object({
          auth: z.string().trim().min(1).max(512),
          p256dh: z.string().trim().min(1).max(2048),
        })
        .strict(),
    })
    .strict()
}

function createPushSubscriptionDeleteBodySchema(allowedOrigins: Set<string>) {
  return z
    .object({
      endpoint: createPushEndpointSchema(allowedOrigins),
    })
    .strict()
}

function toUserSettingsPatch(
  input: z.infer<typeof userNotificationSettingsPatchSchema>,
): Partial<UserNotificationSettings> {
  const patch: Partial<UserNotificationSettings> = {}

  if (input.newMessagesEnabled !== undefined) {
    patch.newMessagesEnabled = input.newMessagesEnabled
  }

  if (input.pushEnabled !== undefined) {
    patch.pushEnabled = input.pushEnabled
  }

  if (input.soundEnabled !== undefined) {
    patch.soundEnabled = input.soundEnabled
  }

  return patch
}

function toChatOverridesPatch(
  input: z.infer<typeof chatNotificationSettingsPatchSchema>,
): Partial<ChatNotificationOverrides> {
  const patch: Partial<ChatNotificationOverrides> = {}

  if (input.newMessagesEnabled !== undefined) {
    patch.newMessagesEnabled = input.newMessagesEnabled
  }

  if (input.pushEnabled !== undefined) {
    patch.pushEnabled = input.pushEnabled
  }

  if (input.soundEnabled !== undefined) {
    patch.soundEnabled = input.soundEnabled
  }

  return patch
}

export function registerChatNotificationRoutes(
  app: FastifyInstance,
  {
    authService,
    createChatNotificationsService,
    createPushSubscriptionService,
    env,
  }: RegisterChatNotificationRoutesOptions,
) {
  const allowedPushOrigins = normalizeAllowedOrigins(
    env.PUSH_SUBSCRIPTION_ALLOWED_ORIGINS,
  )
  const pushSubscriptionBodySchema =
    createPushSubscriptionBodySchema(allowedPushOrigins)
  const pushSubscriptionDeleteBodySchema =
    createPushSubscriptionDeleteBodySchema(allowedPushOrigins)

  app.get('/api/notifications/settings', async (request, reply) => {
    const user = await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })

    return createChatNotificationsService(request).getGlobalSettings({
      portalUserId: user.id,
    })
  })

  app.patch('/api/notifications/settings', async (request, reply) => {
    assertAllowedTenantOrigin(request)

    const user = await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })
    const patch = userNotificationSettingsPatchSchema.parse(request.body)

    return createChatNotificationsService(request).updateGlobalSettings({
      patch: toUserSettingsPatch(patch),
      portalUserId: user.id,
    })
  })

  app.get(
    '/api/chat/threads/:threadId/notification-settings',
    async (request, reply) => {
      const user = await resolveAuthenticatedPortalUser({
        authService,
        env,
        reply,
        request,
      })
      const params = threadParamsSchema.parse(request.params)

      return createChatNotificationsService(request).getSettings({
        portalUserId: user.id,
        threadId: params.threadId,
      })
    },
  )

  app.patch(
    '/api/chat/threads/:threadId/notification-settings',
    async (request, reply) => {
      assertAllowedTenantOrigin(request)

      const user = await resolveAuthenticatedPortalUser({
        authService,
        env,
        reply,
        request,
      })
      const params = threadParamsSchema.parse(request.params)
      const patch = chatNotificationSettingsPatchSchema.parse(request.body)

      return createChatNotificationsService(request).updateSettings({
        patch: toChatOverridesPatch(patch),
        portalUserId: user.id,
        threadId: params.threadId,
      })
    },
  )

  app.get('/api/notifications/push/public-key', async (request, reply) => {
    await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })

    return createPushSubscriptionService(request).getPublicKey()
  })

  app.post('/api/notifications/push/subscriptions', async (request, reply) => {
    assertAllowedTenantOrigin(request)

    const user = await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })
    const body = pushSubscriptionBodySchema.parse(request.body)
    const userAgentHeader = request.headers['user-agent']

    await createPushSubscriptionService(request).saveSubscription({
      portalUserId: user.id,
      subscription: {
        endpoint: body.endpoint,
        keys: body.keys,
        userAgent: typeof userAgentHeader === 'string' ? userAgentHeader : null,
      },
    })

    reply.code(204)
    return reply.send()
  })

  app.delete(
    '/api/notifications/push/subscriptions',
    async (request, reply) => {
      assertAllowedTenantOrigin(request)

      const user = await resolveAuthenticatedPortalUser({
        authService,
        env,
        reply,
        request,
      })
      const body = pushSubscriptionDeleteBodySchema.parse(request.body)

      await createPushSubscriptionService(request).disableSubscription({
        endpoint: body.endpoint,
        portalUserId: user.id,
      })

      reply.code(204)
      return reply.send()
    },
  )
}
