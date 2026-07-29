import { ApiError } from '../../lib/errors.js'
import { PushSubscriptionRegistrationBusyError } from './pushSubscriptionRegistrationRepository.js'
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
    'disablePushSubscription' | 'savePushSubscription'
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

      try {
        await repository.savePushSubscription({
          auth: subscription.keys.auth,
          deviceId: subscription.deviceId,
          endpoint: subscription.endpoint,
          now: currentTime,
          p256dh: subscription.keys.p256dh,
          portalUserId,
          userAgent: subscription.userAgent,
          vapidKeyId: vapidConfig.keyId,
          vapidPublicKeyFingerprint: vapidConfig.publicKeyFingerprint,
        })
      } catch (error) {
        if (error instanceof PushSubscriptionRegistrationBusyError) {
          throw new ApiError(
            503,
            'push_subscription_busy',
            'Не удалось подключить push-уведомления. Повторите попытку.',
          )
        }

        throw error
      }
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
