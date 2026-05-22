export type UserNotificationSettings = {
  newMessagesEnabled: boolean
  pushEnabled: boolean
  soundEnabled: boolean
}

export type ChatNotificationOverrides = {
  newMessagesEnabled: boolean | null
  pushEnabled: boolean | null
  soundEnabled: boolean | null
}

export type ChatNotificationSettings = {
  effective: UserNotificationSettings
  global: UserNotificationSettings
  overrides: ChatNotificationOverrides
  threadId: string
}

export type PushSubscriptionStatus = 'active' | 'disabled' | 'expired'

export type PushDeliveryStatus = 'expired' | 'failed' | 'sent' | 'skipped'

export type BrowserPushSubscriptionInput = {
  endpoint: string
  keys: {
    auth: string
    p256dh: string
  }
  userAgent: string | null
}

export type PushSubscriptionRecord = {
  auth: string
  endpoint: string
  id: number
  p256dh: string
}

export type PushTransportSubscription = {
  endpoint: string
  keys: {
    auth: string
    p256dh: string
  }
}

export type PushPublicKeyResponse =
  | {
      available: true
      publicKey: string
      publicKeyFingerprint: string
      vapidKeyId: string
    }
  | {
      available: false
    }
