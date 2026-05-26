import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getPushPublicKey } from '../api/chatClient'
import {
  getBrowserPushSupportState,
  getExistingBrowserPushSubscription,
  isBrowserPushSubscriptionForPublicKey,
} from '../../../pwa/serviceWorkerRuntime'
import { loadBrowserPushSnapshot } from './notificationBrowserPush'

vi.mock('../api/chatClient', () => ({
  getPushPublicKey: vi.fn(),
}))

vi.mock('../../../pwa/serviceWorkerRuntime', () => ({
  getBrowserPushSupportState: vi.fn(),
  getExistingBrowserPushSubscription: vi.fn(),
  isBrowserPushSubscriptionForPublicKey: vi.fn(),
  subscribeBrowserPush: vi.fn(),
  unsubscribeBrowserPush: vi.fn(),
}))

const getPushPublicKeyMock = vi.mocked(getPushPublicKey)
const getBrowserPushSupportStateMock = vi.mocked(getBrowserPushSupportState)
const getExistingBrowserPushSubscriptionMock = vi.mocked(
  getExistingBrowserPushSubscription,
)
const isBrowserPushSubscriptionForPublicKeyMock = vi.mocked(
  isBrowserPushSubscriptionForPublicKey,
)

describe('notificationBrowserPush', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  beforeEach(() => {
    vi.stubGlobal('Notification', {
      permission: 'granted',
    })
    getBrowserPushSupportStateMock.mockReturnValue({
      reason: 'supported',
      supported: true,
    })
    getPushPublicKeyMock.mockResolvedValue({
      available: true,
      publicKey: 'AQID',
      publicKeyFingerprint: 'sha256-current',
      vapidKeyId: 'current-key',
    })
    isBrowserPushSubscriptionForPublicKeyMock.mockReturnValue(true)
  })

  it('does not treat a browser subscription from an old VAPID key as connected', async () => {
    const existingSubscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/old-subscription',
    } as PushSubscription
    getExistingBrowserPushSubscriptionMock.mockResolvedValueOnce(
      existingSubscription,
    )
    isBrowserPushSubscriptionForPublicKeyMock.mockReturnValueOnce(false)

    await expect(loadBrowserPushSnapshot()).resolves.toMatchObject({
      configured: true,
      permission: 'granted',
      subscribed: false,
      subscriptionEndpoint: null,
    })
    expect(isBrowserPushSubscriptionForPublicKeyMock).toHaveBeenCalledWith(
      existingSubscription,
      'AQID',
    )
  })
})
