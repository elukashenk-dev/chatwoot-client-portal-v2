import {
  deletePushSubscription,
  getPushPublicKey,
  savePushSubscription,
} from '../api/chatClient'
import type { PushPublicKeyResponse } from '../types'
import {
  getBrowserPushSupportState,
  getExistingBrowserPushSubscription,
  subscribeBrowserPush,
  unsubscribeBrowserPush,
  type BrowserPushSupportState,
} from '../../../pwa/serviceWorkerRuntime'

export type BrowserPushSnapshot = {
  configured: boolean
  permission: NotificationPermission | 'unsupported'
  publicKey: PushPublicKeyResponse
  subscribed: boolean
  subscriptionEndpoint: string | null
  support: BrowserPushSupportState
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

  return {
    configured: publicKey.available,
    permission: readNotificationPermission(support),
    publicKey,
    subscribed: Boolean(existingSubscription),
    subscriptionEndpoint: existingSubscription?.endpoint ?? null,
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

  await savePushSubscription(subscription)

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
