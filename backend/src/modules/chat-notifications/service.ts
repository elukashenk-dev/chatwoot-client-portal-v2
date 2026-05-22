import { ApiError } from '../../lib/errors.js'
import type { ChatThreadsService } from '../chat-threads/service.js'
import {
  defaultUserNotificationSettings,
  emptyChatNotificationOverrides,
  resolveEffectiveChatNotificationSettings,
} from './settings.js'
import type {
  ChatNotificationOverrides,
  ChatNotificationSettings,
  UserNotificationSettings,
} from './types.js'
import type { ChatNotificationsRepository } from './repository.js'

type ChatNotificationThreadService = Pick<
  ChatThreadsService,
  'getCurrentUserThreadContext'
>

type CreateChatNotificationsServiceOptions = {
  chatThreadsService: ChatNotificationThreadService
  now?: () => Date
  repository: ChatNotificationsRepository
}

function mergeChatOverrides({
  patch,
  previous,
}: {
  patch: Partial<ChatNotificationOverrides>
  previous: ChatNotificationOverrides
}): ChatNotificationOverrides {
  return {
    newMessagesEnabled:
      patch.newMessagesEnabled === undefined
        ? previous.newMessagesEnabled
        : patch.newMessagesEnabled,
    pushEnabled:
      patch.pushEnabled === undefined
        ? previous.pushEnabled
        : patch.pushEnabled,
    soundEnabled:
      patch.soundEnabled === undefined
        ? previous.soundEnabled
        : patch.soundEnabled,
  }
}

function buildChatSettings({
  global,
  overrides,
  threadId,
}: {
  global: UserNotificationSettings
  overrides: ChatNotificationOverrides
  threadId: string
}): ChatNotificationSettings {
  return {
    effective: resolveEffectiveChatNotificationSettings({
      global,
      overrides,
    }),
    global,
    overrides,
    threadId,
  }
}

export function createChatNotificationsService({
  chatThreadsService,
  now = () => new Date(),
  repository,
}: CreateChatNotificationsServiceOptions) {
  async function getGlobalSettings({ portalUserId }: { portalUserId: number }) {
    return (
      (await repository.findUserSettings(portalUserId)) ??
      defaultUserNotificationSettings
    )
  }

  async function assertThreadAccess({
    portalUserId,
    threadId,
  }: {
    portalUserId: number
    threadId: string
  }) {
    const context = await chatThreadsService.getCurrentUserThreadContext({
      threadId,
      userId: portalUserId,
    })

    if (context.result === 'unavailable') {
      throw new ApiError(
        503,
        'settings_unavailable',
        'Настройки уведомлений временно недоступны.',
      )
    }

    if (!context.activeThread) {
      throw new ApiError(
        403,
        'thread_access_denied',
        'Нет доступа к этому чату.',
      )
    }

    return context
  }

  return {
    async getGlobalSettings({
      portalUserId,
    }: {
      portalUserId: number
    }): Promise<UserNotificationSettings> {
      return getGlobalSettings({ portalUserId })
    },

    async getSettings({
      portalUserId,
      threadId,
    }: {
      portalUserId: number
      threadId: string
    }): Promise<ChatNotificationSettings> {
      await assertThreadAccess({
        portalUserId,
        threadId,
      })

      const global = await getGlobalSettings({ portalUserId })
      const overrides =
        (await repository.findChatOverrides({
          portalUserId,
          threadId,
        })) ?? emptyChatNotificationOverrides

      return buildChatSettings({
        global,
        overrides,
        threadId,
      })
    },

    async updateGlobalSettings({
      patch,
      portalUserId,
    }: {
      patch: Partial<UserNotificationSettings>
      portalUserId: number
    }): Promise<UserNotificationSettings> {
      const previous = await getGlobalSettings({ portalUserId })

      return repository.upsertUserSettings({
        now: now(),
        patch,
        portalUserId,
        previous,
      })
    },

    async updateSettings({
      patch,
      portalUserId,
      threadId,
    }: {
      patch: Partial<ChatNotificationOverrides>
      portalUserId: number
      threadId: string
    }): Promise<ChatNotificationSettings> {
      await assertThreadAccess({
        portalUserId,
        threadId,
      })

      const global = await getGlobalSettings({ portalUserId })
      const previous =
        (await repository.findChatOverrides({
          portalUserId,
          threadId,
        })) ?? emptyChatNotificationOverrides
      const overrides = await repository.upsertChatOverrides({
        now: now(),
        overrides: mergeChatOverrides({
          patch,
          previous,
        }),
        portalUserId,
        threadId,
      })

      return buildChatSettings({
        global,
        overrides,
        threadId,
      })
    },
  }
}

export type ChatNotificationsService = ReturnType<
  typeof createChatNotificationsService
>
