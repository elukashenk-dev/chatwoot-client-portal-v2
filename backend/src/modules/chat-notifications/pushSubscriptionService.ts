import { ApiError } from '../../lib/errors.js'
import type { ChatNotificationsRepository } from './repository.js'
import type {
  BrowserPushSubscriptionInput,
  PushPublicKeyResponse,
} from './types.js'
import type { VapidConfig } from './vapid.js'

type CreatePushSubscriptionServiceOptions = {
  now?: () => Date
  repository: Pick<
    ChatNotificationsRepository,
    | 'disableOtherPushSubscriptionsForEndpoint'
    | 'disablePushSubscription'
    | 'upsertPushSubscription'
  >
  vapidConfig: VapidConfig | null
}

export function createPushSubscriptionService({
  now = () => new Date(),
  repository,
  vapidConfig,
}: CreatePushSubscriptionServiceOptions) {
  return {
    getPublicKey(): PushPublicKeyResponse {
      if (!vapidConfig) {
        return {
          available: false,
        }
      }

      return {
        available: true,
        publicKey: vapidConfig.publicKey,
        publicKeyFingerprint: vapidConfig.publicKeyFingerprint,
        vapidKeyId: vapidConfig.keyId,
      }
    },

    async saveSubscription({
      portalUserId,
      subscription,
    }: {
      portalUserId: number
      subscription: BrowserPushSubscriptionInput
    }) {
      if (!vapidConfig) {
        throw new ApiError(
          409,
          'push_not_configured',
          'Push-уведомления не настроены на сервере.',
        )
      }
      const currentTime = now()

      await repository.upsertPushSubscription({
        auth: subscription.keys.auth,
        endpoint: subscription.endpoint,
        now: currentTime,
        p256dh: subscription.keys.p256dh,
        portalUserId,
        userAgent: subscription.userAgent,
        vapidKeyId: vapidConfig.keyId,
        vapidPublicKeyFingerprint: vapidConfig.publicKeyFingerprint,
      })
      await repository.disableOtherPushSubscriptionsForEndpoint({
        endpoint: subscription.endpoint,
        now: currentTime,
        portalUserId,
      })
    },

    async disableSubscription({
      endpoint,
      portalUserId,
    }: {
      endpoint: string
      portalUserId: number
    }) {
      await repository.disablePushSubscription({
        endpoint,
        now: now(),
        portalUserId,
      })
    },
  }
}

export type PushSubscriptionService = ReturnType<
  typeof createPushSubscriptionService
>
