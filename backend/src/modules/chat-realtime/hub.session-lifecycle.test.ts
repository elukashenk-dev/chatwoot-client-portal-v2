import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DatabaseClient } from '../../db/client.js'
import { portalSessions, portalUsers } from '../../db/schema.js'
import { hashPassword } from '../../lib/password.js'
import { testEnv } from '../../test/appTestHelpers.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import { seedTestTenant } from '../../test/testTenants.js'
import { createPortalUsersRepository } from '../portal-users/repository.js'
import { createAuthService } from '../auth/service.js'
import type { ChatMessagesSnapshot } from '../chat-messages/service.js'
import { createChatRealtimeHub } from './hub.js'

const readySnapshot: ChatMessagesSnapshot = {
  activeThread: {
    id: 'private:me',
    subtitle: 'Вы и поддержка',
    title: 'Личный чат',
    type: 'private',
  },
  hasMoreOlder: false,
  messages: [],
  nextOlderCursor: null,
  reason: 'none',
  result: 'ready',
}

describe('chat realtime session lifecycle', () => {
  let database: DatabaseClient
  let tenantId: number
  let userId: number

  beforeEach(async () => {
    database = await createTestDatabase()
    tenantId = (await seedTestTenant(database.db)).id
    const user = await createPortalUsersRepository(database.db).create({
      email: 'user@example.test',
      fullName: 'Portal User',
      passwordHash: await hashPassword('Password123'),
      tenantId,
    })

    if (!user) {
      throw new Error('Failed to seed realtime session user.')
    }

    userId = user.id
  })

  afterEach(async () => {
    await database.close()
  })

  it.each(['logout', 'expiry', 'deactivation'] as const)(
    'stops an established stream after session %s',
    async (revocation) => {
      let currentNow = new Date('2026-07-28T12:00:00.000Z')
      const authService = createAuthService({
        db: database.db,
        env: testEnv,
        now: () => currentNow,
      })
      const login = await authService.login({
        email: 'user@example.test',
        password: 'Password123',
        tenantId,
      })
      const [session] = await database.db
        .select({ id: portalSessions.id })
        .from(portalSessions)
        .where(eq(portalSessions.userId, userId))

      if (!session) {
        throw new Error('Failed to resolve realtime test session.')
      }

      const realtimeHub = createChatRealtimeHub({
        resolveActiveSessions: authService.resolveActiveSessions,
      })
      const close = vi.fn()
      const send = vi.fn()
      const createSnapshotForUser = vi.fn(async () => readySnapshot)

      realtimeHub.subscribe({
        close,
        send,
        sessionId: session.id,
        tenantId,
        threadId: 'private:me',
        userId,
      })

      await expect(
        realtimeHub.publishThreadMessages({
          createSnapshotForUser,
          tenantId,
          threadId: 'private:me',
        }),
      ).resolves.toBe(1)
      expect(send).toHaveBeenCalledTimes(1)

      if (revocation === 'logout') {
        await authService.logout({
          sessionToken: login.sessionToken,
          tenantId,
        })
      } else if (revocation === 'expiry') {
        currentNow = new Date(login.expiresAt.getTime() + 1)
      } else {
        await database.db
          .update(portalUsers)
          .set({ isActive: false })
          .where(eq(portalUsers.id, userId))
      }

      close.mockClear()
      createSnapshotForUser.mockClear()
      send.mockClear()

      await expect(
        realtimeHub.publishThreadMessages({
          createSnapshotForUser,
          tenantId,
          threadId: 'private:me',
        }),
      ).resolves.toBe(0)
      expect(send).not.toHaveBeenCalled()
      expect(close).toHaveBeenCalledTimes(1)
      expect(createSnapshotForUser).not.toHaveBeenCalled()

      createSnapshotForUser.mockClear()

      await expect(
        realtimeHub.publishThreadMessages({
          createSnapshotForUser,
          tenantId,
          threadId: 'private:me',
        }),
      ).resolves.toBe(0)
      expect(createSnapshotForUser).not.toHaveBeenCalled()
    },
  )
})
