import { describe, expect, it, vi } from 'vitest'

import { createChatNotificationsService } from './service.js'
import { resolveEffectiveChatNotificationSettings } from './settings.js'
import type { ChatNotificationsRepository } from './repository.js'

function createReadyThreadService() {
  return {
    getCurrentUserThreadContext: vi.fn(async () => ({
      activeThread: {
        id: 'private:me',
        subtitle: 'Вы и поддержка',
        title: 'Личный чат',
        type: 'private',
      },
      result: 'ready',
    })),
  } as unknown as Parameters<
    typeof createChatNotificationsService
  >[0]['chatThreadsService']
}

function createRepository(
  overrides: Partial<ChatNotificationsRepository> = {},
): ChatNotificationsRepository {
  return {
    findChatOverrides: vi.fn(async () => null),
    findUserSettings: vi.fn(async () => null),
    upsertChatOverrides: vi.fn(async ({ overrides }) => overrides),
    upsertUserSettings: vi.fn(async ({ patch, previous }) => ({
      ...previous,
      ...patch,
    })),
    ...overrides,
  } as ChatNotificationsRepository
}

describe('chat notification settings', () => {
  it('resolves effective settings from global defaults and thread overrides', () => {
    expect(
      resolveEffectiveChatNotificationSettings({
        global: {
          newMessagesEnabled: true,
          soundEnabled: true,
        },
        overrides: {
          newMessagesEnabled: null,
          soundEnabled: false,
        },
      }),
    ).toEqual({
      newMessagesEnabled: true,
      soundEnabled: false,
    })
  })

  it('treats global new message off as a hard off', () => {
    expect(
      resolveEffectiveChatNotificationSettings({
        global: {
          newMessagesEnabled: false,
          soundEnabled: true,
        },
        overrides: {
          newMessagesEnabled: true,
          soundEnabled: true,
        },
      }),
    ).toEqual({
      newMessagesEnabled: false,
      soundEnabled: false,
    })
  })

  it('returns default global settings when no row exists', async () => {
    const service = createChatNotificationsService({
      chatThreadsService: createReadyThreadService(),
      repository: createRepository(),
    })

    await expect(
      service.getGlobalSettings({ portalUserId: 7 }),
    ).resolves.toEqual({
      newMessagesEnabled: true,
      soundEnabled: true,
    })
  })

  it('updates global settings with a partial patch', async () => {
    const repository = createRepository({
      findUserSettings: vi.fn(async () => ({
        newMessagesEnabled: true,
        soundEnabled: true,
      })),
    })
    const service = createChatNotificationsService({
      chatThreadsService: createReadyThreadService(),
      now: () => new Date('2026-05-23T00:00:00.000Z'),
      repository,
    })

    await expect(
      service.updateGlobalSettings({
        patch: { soundEnabled: false },
        portalUserId: 7,
      }),
    ).resolves.toEqual({
      newMessagesEnabled: true,
      soundEnabled: false,
    })
    expect(repository.upsertUserSettings).toHaveBeenCalledWith({
      now: new Date('2026-05-23T00:00:00.000Z'),
      patch: { soundEnabled: false },
      portalUserId: 7,
      previous: {
        newMessagesEnabled: true,
        soundEnabled: true,
      },
    })
  })

  it('returns inherited chat settings when no overrides exist', async () => {
    const service = createChatNotificationsService({
      chatThreadsService: createReadyThreadService(),
      repository: createRepository({
        findUserSettings: vi.fn(async () => ({
          newMessagesEnabled: true,
          soundEnabled: false,
        })),
      }),
    })

    await expect(
      service.getSettings({
        portalUserId: 7,
        threadId: 'private:me',
      }),
    ).resolves.toEqual({
      effective: {
        newMessagesEnabled: true,
        soundEnabled: false,
      },
      global: {
        newMessagesEnabled: true,
        soundEnabled: false,
      },
      overrides: {
        newMessagesEnabled: null,
        soundEnabled: null,
      },
      threadId: 'private:me',
    })
  })

  it('persists null override resets for a chat', async () => {
    const repository = createRepository({
      findChatOverrides: vi.fn(async () => ({
        newMessagesEnabled: false,
        soundEnabled: false,
      })),
      findUserSettings: vi.fn(async () => ({
        newMessagesEnabled: true,
        soundEnabled: true,
      })),
    })
    const service = createChatNotificationsService({
      chatThreadsService: createReadyThreadService(),
      repository,
    })

    await expect(
      service.updateSettings({
        patch: {
          newMessagesEnabled: null,
          soundEnabled: null,
        },
        portalUserId: 7,
        threadId: 'private:me',
      }),
    ).resolves.toMatchObject({
      effective: {
        newMessagesEnabled: true,
        soundEnabled: true,
      },
      overrides: {
        newMessagesEnabled: null,
        soundEnabled: null,
      },
    })
  })

  it('rejects chat settings access when thread access is denied', async () => {
    const service = createChatNotificationsService({
      chatThreadsService: {
        getCurrentUserThreadContext: vi.fn(async () => ({
          activeThread: null,
          reason: 'thread_access_denied',
          result: 'not_ready',
        })),
      } as unknown as Parameters<
        typeof createChatNotificationsService
      >[0]['chatThreadsService'],
      repository: createRepository(),
    })

    await expect(
      service.getSettings({
        portalUserId: 7,
        threadId: 'group:155',
      }),
    ).rejects.toMatchObject({
      code: 'thread_access_denied',
      statusCode: 403,
    })
  })
})
