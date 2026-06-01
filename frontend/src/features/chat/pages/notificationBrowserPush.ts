import {
  deletePushSubscription,
  getPushPublicKey,
  savePushSubscription,
} from '../api/chatClient'
import type { PushPublicKeyResponse } from '../types'
import {
  getBrowserPushSupportState,
  getExistingBrowserPushSubscription,
  isBrowserPushSubscriptionForPublicKey,
  subscribeBrowserPush,
  unsubscribeBrowserPush,
  type BrowserPushSupportState,
} from '../../../pwa/serviceWorkerRuntime'

const PUSH_DEVICE_ID_STORAGE_KEY = 'provgroup-portal-push-device-id'
const PUSH_DEVICE_ID_PREFIX = 'portal-device-'

export type BrowserPushSnapshot = {
  configured: boolean
  permission: NotificationPermission | 'unsupported'
  publicKey: PushPublicKeyResponse
  subscribed: boolean
  subscriptionEndpoint: string | null
  support: BrowserPushSupportState
}

function isValidBrowserPushDeviceId(value: string | null): value is string {
  return (
    value !== null &&
    value.startsWith(PUSH_DEVICE_ID_PREFIX) &&
    value.length <= 128 &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  )
}

function createBrowserPushDeviceId() {
  const randomUUID =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

  return `${PUSH_DEVICE_ID_PREFIX}${randomUUID}`
}

export function getOrCreateBrowserPushDeviceId() {
  try {
    const existingDeviceId = localStorage.getItem(PUSH_DEVICE_ID_STORAGE_KEY)

    if (isValidBrowserPushDeviceId(existingDeviceId)) {
      return existingDeviceId
    }

    const deviceId = createBrowserPushDeviceId()
    localStorage.setItem(PUSH_DEVICE_ID_STORAGE_KEY, deviceId)

    return deviceId
  } catch {
    return createBrowserPushDeviceId()
  }
}

export function readNotificationPermission(
  support: BrowserPushSupportState,
): NotificationPermission | 'unsupported' {
  if (!support.supported || !('Notification' in window)) {
    return 'unsupported'
  }

  return Notification.permission
}

export async function loadBrowserPushSnapshot(): Promise<BrowserPushSnapshot> {
  const support = getBrowserPushSupportState()
  if (!support.supported) {
    return {
      configured: false,
      permission: 'unsupported',
      publicKey: {
        available: false,
      },
      subscribed: false,
      subscriptionEndpoint: null,
      support,
    }
  }

  const publicKey = await getPushPublicKey()
  const existingSubscription = await getExistingBrowserPushSubscription()
  const isCurrentSubscription = existingSubscription
    ? !publicKey.available ||
      isBrowserPushSubscriptionForPublicKey(
        existingSubscription,
        publicKey.publicKey,
      )
    : false

  if (publicKey.available && isCurrentSubscription && existingSubscription) {
    await savePushSubscription({
      deviceId: getOrCreateBrowserPushDeviceId(),
      subscription: existingSubscription.toJSON(),
    })
  }

  return {
    configured: publicKey.available,
    permission: readNotificationPermission(support),
    publicKey,
    subscribed: isCurrentSubscription,
    subscriptionEndpoint: isCurrentSubscription
      ? (existingSubscription?.endpoint ?? null)
      : null,
    support,
  }
}

export async function ensureBrowserPushSubscription({
  browserPush,
}: {
  browserPush: BrowserPushSnapshot
}) {
  if (!browserPush.support.supported) {
    return {
      browserPush,
      result: 'unsupported' as const,
    }
  }

  if (!browserPush.publicKey.available) {
    return {
      browserPush,
      result: 'unconfigured' as const,
    }
  }

  let permission = readNotificationPermission(browserPush.support)

  if (permission === 'default') {
    permission = await Notification.requestPermission()
  }

  if (permission !== 'granted') {
    return {
      browserPush: {
        ...browserPush,
        permission,
      },
      result: 'permission_not_granted' as const,
    }
  }

  const subscription = await subscribeBrowserPush(
    browserPush.publicKey.publicKey,
  )

  await savePushSubscription({
    deviceId: getOrCreateBrowserPushDeviceId(),
    subscription,
  })

  return {
    browserPush: {
      ...browserPush,
      permission,
      subscribed: true,
      subscriptionEndpoint: subscription.endpoint ?? null,
    },
    result: 'subscribed' as const,
  }
}

export async function disableBrowserPushOnDevice({
  browserPush,
}: {
  browserPush: BrowserPushSnapshot
}) {
  const endpoint = await unsubscribeBrowserPush()
  const endpointToDisable = endpoint ?? browserPush.subscriptionEndpoint

  if (endpointToDisable) {
    await deletePushSubscription(endpointToDisable)
  }

  return {
    ...browserPush,
    subscribed: false,
    subscriptionEndpoint: null,
  }
}

export async function disableCurrentBrowserPushBestEffort() {
  try {
    const browserPush = await loadBrowserPushSnapshot()

    if (!browserPush.subscribed) {
      return
    }

    await disableBrowserPushOnDevice({ browserPush })
  } catch {
    // Logout must not be blocked by best-effort local push cleanup.
  }
}
