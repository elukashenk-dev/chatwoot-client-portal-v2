import { and, eq } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import {
  portalChatNotificationPreferences,
  portalPushDeliveries,
  portalPushSubscriptions,
  portalUserNotificationPreferences,
} from '../../db/schema.js'
import type {
  ChatNotificationOverrides,
  PushDeliveryStatus,
  PushSubscriptionRecord,
  UserNotificationSettings,
} from './types.js'

type TenantRepositoryScope = {
  tenantId: number
}

type UserNotificationPreferenceRow = {
  newMessagesEnabled: boolean
  pushEnabled: boolean
  soundEnabled: boolean
}

type ChatNotificationPreferenceRow = {
  newMessagesEnabled: boolean | null
  pushEnabled: boolean | null
  soundEnabled: boolean | null
}

const userNotificationPreferenceSelection = {
  newMessagesEnabled: portalUserNotificationPreferences.newMessagesEnabled,
  pushEnabled: portalUserNotificationPreferences.pushEnabled,
  soundEnabled: portalUserNotificationPreferences.soundEnabled,
}

const chatNotificationPreferenceSelection = {
  newMessagesEnabled:
    portalChatNotificationPreferences.newMessagesEnabledOverride,
  pushEnabled: portalChatNotificationPreferences.pushEnabledOverride,
  soundEnabled: portalChatNotificationPreferences.soundEnabledOverride,
}

const pushSubscriptionSelection = {
  auth: portalPushSubscriptions.auth,
  endpoint: portalPushSubscriptions.endpoint,
  id: portalPushSubscriptions.id,
  p256dh: portalPushSubscriptions.p256dh,
}

function mapUserSettings(
  row: UserNotificationPreferenceRow,
): UserNotificationSettings {
  return {
    newMessagesEnabled: row.newMessagesEnabled,
    pushEnabled: row.pushEnabled,
    soundEnabled: row.soundEnabled,
  }
}

function mapChatOverrides(
  row: ChatNotificationPreferenceRow,
): ChatNotificationOverrides {
  return {
    newMessagesEnabled: row.newMessagesEnabled,
    pushEnabled: row.pushEnabled,
    soundEnabled: row.soundEnabled,
  }
}

export function createChatNotificationsRepository(
  db: AppDatabase,
  { tenantId }: TenantRepositoryScope,
) {
  return {
    async disablePushSubscription({
      endpoint,
      now,
      portalUserId,
    }: {
      endpoint: string
      now: Date
      portalUserId: number
    }) {
      await db
        .update(portalPushSubscriptions)
        .set({
          status: 'disabled',
          updatedAt: now,
        })
        .where(
          and(
            eq(portalPushSubscriptions.tenantId, tenantId),
            eq(portalPushSubscriptions.portalUserId, portalUserId),
            eq(portalPushSubscriptions.endpoint, endpoint),
          ),
        )
    },

    async findUserSettings(portalUserId: number) {
      const [row] = await db
        .select(userNotificationPreferenceSelection)
        .from(portalUserNotificationPreferences)
        .where(
          and(
            eq(portalUserNotificationPreferences.tenantId, tenantId),
            eq(portalUserNotificationPreferences.portalUserId, portalUserId),
          ),
        )
        .limit(1)

      return row ? mapUserSettings(row) : null
    },

    async listActivePushSubscriptions(portalUserId: number) {
      const rows = await db
        .select(pushSubscriptionSelection)
        .from(portalPushSubscriptions)
        .where(
          and(
            eq(portalPushSubscriptions.tenantId, tenantId),
            eq(portalPushSubscriptions.portalUserId, portalUserId),
            eq(portalPushSubscriptions.status, 'active'),
          ),
        )

      return rows satisfies PushSubscriptionRecord[]
    },

    async markPushSubscriptionExpired({
      error,
      now,
      subscriptionId,
    }: {
      error: string | null
      now: Date
      subscriptionId: number
    }) {
      await db
        .update(portalPushSubscriptions)
        .set({
          lastError: error,
          lastErrorAt: now,
          status: 'expired',
          updatedAt: now,
        })
        .where(
          and(
            eq(portalPushSubscriptions.tenantId, tenantId),
            eq(portalPushSubscriptions.id, subscriptionId),
          ),
        )
    },

    async recordPushDeliveryAttempt({
      chatwootMessageId,
      now,
      portalChatThreadId,
      portalUserId,
      status,
      subscriptionId,
      threadId,
    }: {
      chatwootMessageId: number
      now: Date
      portalChatThreadId: number
      portalUserId: number
      status: PushDeliveryStatus
      subscriptionId: number
      threadId: string
    }) {
      const [delivery] = await db
        .insert(portalPushDeliveries)
        .values({
          chatwootMessageId,
          portalChatThreadId,
          portalUserId,
          status,
          subscriptionId,
          tenantId,
          threadId,
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning({
          id: portalPushDeliveries.id,
        })

      return delivery ? delivery.id : null
    },

    async updatePushDeliveryStatus({
      deliveryId,
      errorCode,
      status,
    }: {
      deliveryId: number
      errorCode: string | null
      status: PushDeliveryStatus
    }) {
      await db
        .update(portalPushDeliveries)
        .set({
          errorCode,
          status,
        })
        .where(
          and(
            eq(portalPushDeliveries.tenantId, tenantId),
            eq(portalPushDeliveries.id, deliveryId),
          ),
        )
    },

    async updatePushSubscriptionFailure({
      error,
      now,
      subscriptionId,
    }: {
      error: string | null
      now: Date
      subscriptionId: number
    }) {
      await db
        .update(portalPushSubscriptions)
        .set({
          lastError: error,
          lastErrorAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(portalPushSubscriptions.tenantId, tenantId),
            eq(portalPushSubscriptions.id, subscriptionId),
          ),
        )
    },

    async upsertPushSubscription({
      auth,
      endpoint,
      now,
      p256dh,
      portalUserId,
      userAgent,
      vapidKeyId,
      vapidPublicKeyFingerprint,
    }: {
      auth: string
      endpoint: string
      now: Date
      p256dh: string
      portalUserId: number
      userAgent: string | null
      vapidKeyId: string
      vapidPublicKeyFingerprint: string
    }) {
      await db
        .insert(portalPushSubscriptions)
        .values({
          auth,
          endpoint,
          p256dh,
          portalUserId,
          status: 'active',
          tenantId,
          updatedAt: now,
          userAgent,
          vapidKeyId,
          vapidPublicKeyFingerprint,
        })
        .onConflictDoUpdate({
          set: {
            auth,
            p256dh,
            status: 'active',
            updatedAt: now,
            userAgent,
            vapidKeyId,
            vapidPublicKeyFingerprint,
          },
          target: [
            portalPushSubscriptions.tenantId,
            portalPushSubscriptions.portalUserId,
            portalPushSubscriptions.endpoint,
          ],
        })
    },

    async findChatOverrides({
      portalUserId,
      threadId,
    }: {
      portalUserId: number
      threadId: string
    }) {
      const [row] = await db
        .select(chatNotificationPreferenceSelection)
        .from(portalChatNotificationPreferences)
        .where(
          and(
            eq(portalChatNotificationPreferences.tenantId, tenantId),
            eq(portalChatNotificationPreferences.portalUserId, portalUserId),
            eq(portalChatNotificationPreferences.threadId, threadId),
          ),
        )
        .limit(1)

      return row ? mapChatOverrides(row) : null
    },

    async upsertUserSettings({
      now,
      patch,
      portalUserId,
      previous,
    }: {
      now: Date
      patch: Partial<UserNotificationSettings>
      portalUserId: number
      previous: UserNotificationSettings
    }) {
      const nextSettings = {
        ...previous,
        ...patch,
      }

      const [row] = await db
        .insert(portalUserNotificationPreferences)
        .values({
          newMessagesEnabled: nextSettings.newMessagesEnabled,
          portalUserId,
          pushEnabled: nextSettings.pushEnabled,
          soundEnabled: nextSettings.soundEnabled,
          tenantId,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          set: {
            newMessagesEnabled: nextSettings.newMessagesEnabled,
            pushEnabled: nextSettings.pushEnabled,
            soundEnabled: nextSettings.soundEnabled,
            updatedAt: now,
          },
          target: [
            portalUserNotificationPreferences.tenantId,
            portalUserNotificationPreferences.portalUserId,
          ],
        })
        .returning(userNotificationPreferenceSelection)

      if (!row) {
        throw new Error('Failed to upsert user notification settings.')
      }

      return mapUserSettings(row)
    },

    async upsertChatOverrides({
      now,
      overrides,
      portalUserId,
      threadId,
    }: {
      now: Date
      overrides: ChatNotificationOverrides
      portalUserId: number
      threadId: string
    }) {
      const [row] = await db
        .insert(portalChatNotificationPreferences)
        .values({
          newMessagesEnabledOverride: overrides.newMessagesEnabled,
          portalUserId,
          pushEnabledOverride: overrides.pushEnabled,
          soundEnabledOverride: overrides.soundEnabled,
          tenantId,
          threadId,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          set: {
            newMessagesEnabledOverride: overrides.newMessagesEnabled,
            pushEnabledOverride: overrides.pushEnabled,
            soundEnabledOverride: overrides.soundEnabled,
            updatedAt: now,
          },
          target: [
            portalChatNotificationPreferences.tenantId,
            portalChatNotificationPreferences.portalUserId,
            portalChatNotificationPreferences.threadId,
          ],
        })
        .returning(chatNotificationPreferenceSelection)

      if (!row) {
        throw new Error('Failed to upsert chat notification overrides.')
      }

      return mapChatOverrides(row)
    },
  }
}

export type ChatNotificationsRepository = ReturnType<
  typeof createChatNotificationsRepository
>
