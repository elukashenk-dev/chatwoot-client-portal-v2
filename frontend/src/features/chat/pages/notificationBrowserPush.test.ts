import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getPushPublicKey } from '../api/chatClient'
import { savePushSubscription } from '../api/chatClient'
import {
  getBrowserPushSupportState,
  getExistingBrowserPushSubscription,
  isBrowserPushSubscriptionForPublicKey,
  subscribeBrowserPush,
} from '../../../pwa/serviceWorkerRuntime'
import {
  ensureBrowserPushSubscription,
  getOrCreateBrowserPushDeviceId,
  loadBrowserPushSnapshot,
} from './notificationBrowserPush'

vi.mock('../api/chatClient', () => ({
  getPushPublicKey: vi.fn(),
  savePushSubscription: vi.fn(),
}))

vi.mock('../../../pwa/serviceWorkerRuntime', () => ({
  getBrowserPushSupportState: vi.fn(),
  getExistingBrowserPushSubscription: vi.fn(),
  isBrowserPushSubscriptionForPublicKey: vi.fn(),
  subscribeBrowserPush: vi.fn(),
  unsubscribeBrowserPush: vi.fn(),
}))

const getPushPublicKeyMock = vi.mocked(getPushPublicKey)
const savePushSubscriptionMock = vi.mocked(savePushSubscription)
const getBrowserPushSupportStateMock = vi.mocked(getBrowserPushSupportState)
const getExistingBrowserPushSubscriptionMock = vi.mocked(
  getExistingBrowserPushSubscription,
)
const isBrowserPushSubscriptionForPublicKeyMock = vi.mocked(
  isBrowserPushSubscriptionForPublicKey,
)
const subscribeBrowserPushMock = vi.mocked(subscribeBrowserPush)

describe('notificationBrowserPush', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
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

  it('resaves a current browser subscription with the stable device id', async () => {
    const existingSubscription = {
      endpoint: 'https://push.example.test/subscription',
      toJSON: () => ({
        endpoint: 'https://push.example.test/subscription',
        keys: {
          auth: 'auth-secret',
          p256dh: 'p256dh-key',
        },
      }),
    } as unknown as PushSubscription
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => 'portal-device-existing-id'),
      setItem: vi.fn(),
    })
    getExistingBrowserPushSubscriptionMock.mockResolvedValueOnce(
      existingSubscription,
    )

    await expect(loadBrowserPushSnapshot()).resolves.toMatchObject({
      subscribed: true,
      subscriptionEndpoint: 'https://push.example.test/subscription',
    })
    expect(savePushSubscriptionMock).toHaveBeenCalledWith({
      deviceId: 'portal-device-existing-id',
      subscription: {
        endpoint: 'https://push.example.test/subscription',
        keys: {
          auth: 'auth-secret',
          p256dh: 'p256dh-key',
        },
      },
    })
  })

  it('does not resave a browser subscription when push is unconfigured', async () => {
    getPushPublicKeyMock.mockResolvedValueOnce({
      available: false,
    })
    getExistingBrowserPushSubscriptionMock.mockResolvedValueOnce({
      endpoint: 'https://push.example.test/subscription',
    } as unknown as PushSubscription)

    await expect(loadBrowserPushSnapshot()).resolves.toMatchObject({
      configured: false,
      subscribed: true,
    })
    expect(savePushSubscriptionMock).not.toHaveBeenCalled()
  })

  it('keeps one stable push device id in browser storage', () => {
    const setItem = vi.fn()
    const storage = {
      getItem: vi
        .fn()
        .mockReturnValueOnce(null)
        .mockReturnValueOnce('portal-device-existing-id'),
      setItem,
    } as unknown as Storage
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('crypto', {
      randomUUID: () => '11111111-2222-4333-8444-555555555555',
    })

    expect(getOrCreateBrowserPushDeviceId()).toBe(
      'portal-device-11111111-2222-4333-8444-555555555555',
    )
    expect(getOrCreateBrowserPushDeviceId()).toBe('portal-device-existing-id')
    expect(setItem).toHaveBeenCalledWith(
      'provgroup-portal-push-device-id',
      'portal-device-11111111-2222-4333-8444-555555555555',
    )
  })

  it('sends the stable device id when subscribing browser push', async () => {
    const subscription = {
      endpoint: 'https://push.example.test/subscription',
      keys: {
        auth: 'auth-secret',
        p256dh: 'p256dh-key',
      },
    } as PushSubscriptionJSON
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => 'portal-device-existing-id'),
      setItem: vi.fn(),
    })
    subscribeBrowserPushMock.mockResolvedValueOnce(subscription)

    await ensureBrowserPushSubscription({
      browserPush: {
        configured: true,
        permission: 'granted',
        publicKey: {
          available: true,
          publicKey: 'AQID',
          publicKeyFingerprint: 'sha256-current',
          vapidKeyId: 'current-key',
        },
        subscribed: false,
        subscriptionEndpoint: null,
        support: {
          reason: 'supported',
          supported: true,
        },
      },
    })

    expect(savePushSubscriptionMock).toHaveBeenCalledWith({
      deviceId: 'portal-device-existing-id',
      subscription,
    })
  })
})
