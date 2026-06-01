import { describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import type { DatabaseClient } from '../../db/client.js'
import {
  portalChatUnreadMessages,
  portalChatThreads,
  portalUserContactLinks,
  portalUsers,
} from '../../db/schema.js'
import { hashPassword } from '../../lib/password.js'
import { seedDefaultTenant, testEnv } from '../../test/appTestHelpers.js'
import { createTestDatabase } from '../../test/testDatabase.js'

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  })
}

function createThreadListingChatwootFetch(): typeof fetch {
  return async (url) => {
    const requestUrl =
      url instanceof Request ? new URL(url.url) : new URL(url.toString())

    if (requestUrl.pathname === '/api/v1/accounts/1/contacts/44') {
      return createJsonResponse({
        payload: {
          custom_attributes: {
            portal_client_group_contact_ids: '154',
            portal_contact_type: 'person',
            portal_enabled: true,
          },
          email: 'ivan@example.com',
          id: 44,
          name: 'Иван Петров',
        },
      })
    }

    if (requestUrl.pathname === '/api/v1/accounts/1/contacts/154') {
      return createJsonResponse({
        payload: {
          custom_attributes: {
            portal_contact_type: 'group',
            portal_enabled: true,
          },
          email: 'office@romashka.ru',
          id: 154,
          name: 'ООО "Ромашка"',
        },
      })
    }

    return createJsonResponse({ error: 'not found' }, 404)
  }
}

describe('chat threads app wiring', () => {
  it('persists portal chat threads from the authenticated thread listing route', async () => {
    let app: ReturnType<typeof buildApp> | null = null
    let database: DatabaseClient | null = null

    try {
      database = await createTestDatabase()
      const tenantId = await seedDefaultTenant(database)
      app = buildApp({
        chatwootFetchFn: createThreadListingChatwootFetch(),
        database,
        env: testEnv,
      })
      await app.ready()

      const [portalUser] = await database.db
        .insert(portalUsers)
        .values({
          email: 'ivan@example.com',
          fullName: 'Иван Петров',
          passwordHash: await hashPassword('Secret123'),
          tenantId,
        })
        .returning({ id: portalUsers.id })

      if (!portalUser) {
        throw new Error('Failed to seed portal user.')
      }

      await database.db.insert(portalUserContactLinks).values({
        chatwootContactId: 44,
        tenantId,
        userId: portalUser.id,
      })

      const loginResponse = await app.inject({
        headers: {
          origin: testEnv.APP_ORIGIN,
        },
        method: 'POST',
        payload: {
          email: 'ivan@example.com',
          password: 'Secret123',
        },
        url: '/api/auth/login',
      })
      const sessionCookie = loginResponse.cookies.find(
        (cookie) => cookie.name === testEnv.SESSION_COOKIE_NAME,
      )
      const cookieHeader = `${testEnv.SESSION_COOKIE_NAME}=${
        sessionCookie?.value ?? ''
      }`

      const response = await app.inject({
        headers: {
          cookie: cookieHeader,
        },
        method: 'GET',
        url: '/api/chat/threads',
      })
      const persistedThreads = await database.db
        .select({
          id: portalChatThreads.id,
          chatwootContactId: portalChatThreads.chatwootContactId,
          chatwootConversationId: portalChatThreads.chatwootConversationId,
          chatwootInboxId: portalChatThreads.chatwootInboxId,
          portalUserId: portalChatThreads.portalUserId,
          tenantId: portalChatThreads.tenantId,
          threadType: portalChatThreads.threadType,
        })
        .from(portalChatThreads)
        .orderBy(portalChatThreads.id)

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        activeThreadId: 'private:me',
        threads: [
          {
            avatarUrl: '/api/tenant/icons/icon-192.png',
            id: 'private:me',
            subtitle: 'Вы и поддержка',
            title: 'Личный чат',
            type: 'private',
            unreadCount: 0,
          },
          {
            avatarUrl: null,
            id: 'group:154',
            subtitle: 'Групповой чат',
            title: 'ООО "Ромашка"',
            type: 'group',
            unreadCount: 0,
          },
        ],
        totalUnreadCount: 0,
      })
      expect(
        persistedThreads.map((thread) => ({
          chatwootContactId: thread.chatwootContactId,
          chatwootConversationId: thread.chatwootConversationId,
          chatwootInboxId: thread.chatwootInboxId,
          portalUserId: thread.portalUserId,
          tenantId: thread.tenantId,
          threadType: thread.threadType,
        })),
      ).toEqual([
        {
          chatwootContactId: 44,
          chatwootConversationId: null,
          chatwootInboxId: 1,
          portalUserId: portalUser.id,
          tenantId,
          threadType: 'private',
        },
        {
          chatwootContactId: 154,
          chatwootConversationId: null,
          chatwootInboxId: 1,
          portalUserId: null,
          tenantId,
          threadType: 'group',
        },
      ])

      const privateThread = persistedThreads.find(
        (thread) => thread.threadType === 'private',
      )
      const groupThread = persistedThreads.find(
        (thread) => thread.threadType === 'group',
      )

      if (!privateThread || !groupThread) {
        throw new Error('Expected persisted private and group threads.')
      }

      await database.db.insert(portalChatUnreadMessages).values([
        {
          chatwootMessageId: 501,
          portalChatThreadId: privateThread.id,
          portalUserId: portalUser.id,
          tenantId,
          threadId: 'private:me',
        },
        {
          chatwootMessageId: 601,
          portalChatThreadId: groupThread.id,
          portalUserId: portalUser.id,
          tenantId,
          threadId: 'group:154',
        },
        {
          chatwootMessageId: 602,
          portalChatThreadId: groupThread.id,
          portalUserId: portalUser.id,
          tenantId,
          threadId: 'group:154',
        },
      ])

      const countedResponse = await app.inject({
        headers: {
          cookie: cookieHeader,
        },
        method: 'GET',
        url: '/api/chat/threads',
      })

      expect(countedResponse.statusCode).toBe(200)
      expect(countedResponse.json()).toMatchObject({
        threads: [
          {
            id: 'private:me',
            unreadCount: 1,
          },
          {
            id: 'group:154',
            unreadCount: 2,
          },
        ],
        totalUnreadCount: 3,
      })
    } finally {
      if (app) {
        await app.close()
      } else if (database) {
        await database.close()
      }
    }
  }, 15_000)
})
