import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'

import { registerApiErrorHandler } from '../../lib/errors.js'
import { testEnv } from '../../test/appTestHelpers.js'
import type { AuthService } from '../auth/service.js'
import type { TenantRequestContext } from '../tenants/service.js'
import { registerProfileRoutes } from './routes.js'

const tenant: TenantRequestContext = {
  chatwoot: {
    accountId: 1,
    apiAccessToken: 'test-api-token',
    baseUrl: 'https://chatwoot.example.test',
    portalInboxIdentifier: null,
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

function createMultipartProfileAvatarPayload({
  fileContent,
  fileName,
  mimeType,
}: {
  fileContent: Buffer
  fileName: string
  mimeType: string
}) {
  const boundary = '----portal-profile-test-boundary'
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="avatar"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ),
    fileContent,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])

  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    payload,
  }
}

async function buildProfileRoutesTestApp() {
  const app = Fastify({ logger: false })
  const profileService = {
    getCurrentUserAvatar: vi.fn().mockResolvedValue({
      body: new Response('avatar-bytes').body,
      headers: new Headers({
        'content-type': 'image/png',
      }),
      status: 200,
    }),
    getCurrentUserProfile: vi.fn().mockResolvedValue({
      avatarUrl: '/api/profile/avatar',
      email: 'user@example.test',
      fullName: 'Portal User',
      phoneNumber: '+79001234567',
      result: 'ready',
    }),
    updateCurrentUserAvatar: vi.fn().mockResolvedValue({
      avatarUrl: '/api/profile/avatar',
      result: 'updated',
    }),
  }
  const authService = {
    getCurrentUser: vi.fn(async () => ({
      email: 'user@example.test',
      fullName: 'Portal User',
      id: 7,
    })),
  } as unknown as AuthService

  app.register(cookie, {
    hook: 'onRequest',
    secret: testEnv.SESSION_SECRET,
  })
  app.register(multipart)
  app.decorateRequest('tenant', null)
  app.addHook('onRequest', async (request) => {
    request.tenant = tenant
  })
  registerApiErrorHandler(app)
  registerProfileRoutes(app, {
    authService,
    createProfileService: () => profileService,
    env: testEnv,
  })
  await app.ready()

  return {
    app,
    authService,
    profileService,
  }
}

describe('profile routes', () => {
  it('requires authentication for profile data', async () => {
    const { app, profileService } = await buildProfileRoutesTestApp()

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/profile',
      })

      expect(response.statusCode).toBe(401)
      expect(profileService.getCurrentUserProfile).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  it('returns current user profile through the profile service', async () => {
    const { app, profileService } = await buildProfileRoutesTestApp()

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'GET',
        url: '/api/profile',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        avatarUrl: '/api/profile/avatar',
        email: 'user@example.test',
        fullName: 'Portal User',
        phoneNumber: '+79001234567',
        result: 'ready',
      })
      expect(profileService.getCurrentUserProfile).toHaveBeenCalledWith({
        user: {
          email: 'user@example.test',
          fullName: 'Portal User',
          id: 7,
        },
      })
    } finally {
      await app.close()
    }
  })

  it('streams current user avatar through the profile service', async () => {
    const { app, profileService } = await buildProfileRoutesTestApp()

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'GET',
        url: '/api/profile/avatar',
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['cache-control']).toBe('private, no-store')
      expect(response.headers['content-type']).toBe('image/png')
      expect(response.payload).toBe('avatar-bytes')
      expect(profileService.getCurrentUserAvatar).toHaveBeenCalledWith({
        userId: 7,
      })
    } finally {
      await app.close()
    }
  })

  it('uploads avatar through the profile service', async () => {
    const { app, profileService } = await buildProfileRoutesTestApp()
    const multipart = createMultipartProfileAvatarPayload({
      fileContent: Buffer.from('avatar'),
      fileName: 'avatar.png',
      mimeType: 'image/png',
    })

    try {
      const response = await app.inject({
        headers: {
          'content-type': multipart.contentType,
          cookie: createAuthorizedCookie(app),
          origin: testEnv.APP_ORIGIN,
        },
        method: 'POST',
        payload: multipart.payload,
        url: '/api/profile/avatar',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        avatarUrl: '/api/profile/avatar',
        result: 'updated',
      })
      expect(profileService.updateCurrentUserAvatar).toHaveBeenCalledWith({
        avatar: expect.objectContaining({
          data: expect.any(Buffer),
          fileName: 'avatar.png',
          mimeType: 'image/png',
          size: 6,
        }),
        userId: 7,
      })
    } finally {
      await app.close()
    }
  })

  it('rejects avatar upload without multipart form data', async () => {
    const { app, profileService } = await buildProfileRoutesTestApp()

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
          origin: testEnv.APP_ORIGIN,
        },
        method: 'POST',
        url: '/api/profile/avatar',
      })

      expect(response.statusCode).toBe(415)
      expect(profileService.updateCurrentUserAvatar).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })
})
