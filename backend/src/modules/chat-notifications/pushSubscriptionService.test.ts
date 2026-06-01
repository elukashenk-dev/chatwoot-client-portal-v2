import { describe, expect, it, vi } from 'vitest'

import { createPushSubscriptionService } from './pushSubscriptionService.js'
import { createVapidConfig } from './vapid.js'

const vapidConfig = createVapidConfig({
  PUSH_VAPID_KEY_ID: undefined,
  PUSH_VAPID_PRIVATE_KEY: 'private-key',
  PUSH_VAPID_PUBLIC_KEY: 'public-key',
  PUSH_VAPID_SUBJECT: 'mailto:support@example.test',
})

function createRepository() {
  return {
    disableOtherPushSubscriptionsForDevice: vi.fn(async () => undefined),
    disableOtherPushSubscriptionsForEndpoint: vi.fn(async () => undefined),
    disablePushSubscription: vi.fn(async () => undefined),
    upsertPushSubscription: vi.fn(async () => undefined),
  }
}

describe('push subscription service', () => {
  it('returns unavailable public key state without VAPID config', () => {
    const service = createPushSubscriptionService({
      repository: createRepository(),
      vapidConfig: null,
    })

    expect(service.getPublicKey()).toEqual({
      available: false,
    })
  })

  it('returns public VAPID metadata when configured', () => {
    const service = createPushSubscriptionService({
      repository: createRepository(),
      vapidConfig,
    })

    expect(service.getPublicKey()).toEqual({
      available: true,
      publicKey: 'public-key',
      publicKeyFingerprint:
        'sha256-43a46f1d081d270130e2210a1de59f9715de033307d068edc65a335b27e95d3d',
      vapidKeyId: 'sha256-43a46f1d081d2701',
    })
  })

  it('rejects subscription saves when VAPID config is unavailable', async () => {
    const service = createPushSubscriptionService({
      repository: createRepository(),
      vapidConfig: null,
    })

    await expect(
      service.saveSubscription({
        portalUserId: 7,
        subscription: {
          deviceId: 'portal-device-test-device-1',
          endpoint: 'https://push.example.test/subscription/1',
          keys: {
            auth: 'auth-secret',
            p256dh: 'p256dh-key',
          },
          userAgent: 'Test Browser',
        },
      }),
    ).rejects.toMatchObject({
      code: 'push_not_configured',
      statusCode: 409,
    })
  })

  it('upserts subscription with VAPID metadata', async () => {
    const repository = createRepository()
    const service = createPushSubscriptionService({
      now: () => new Date('2026-05-23T00:00:00.000Z'),
      repository,
      vapidConfig,
    })

    await service.saveSubscription({
      portalUserId: 7,
      subscription: {
        endpoint: 'https://push.example.test/subscription/1',
        deviceId: 'portal-device-test-device-1',
        keys: {
          auth: 'auth-secret',
          p256dh: 'p256dh-key',
        },
        userAgent: 'Test Browser',
      },
    })

    expect(repository.upsertPushSubscription).toHaveBeenCalledWith({
      auth: 'auth-secret',
      deviceId: 'portal-device-test-device-1',
      endpoint: 'https://push.example.test/subscription/1',
      now: new Date('2026-05-23T00:00:00.000Z'),
      p256dh: 'p256dh-key',
      portalUserId: 7,
      userAgent: 'Test Browser',
      vapidKeyId: 'sha256-43a46f1d081d2701',
      vapidPublicKeyFingerprint:
        'sha256-43a46f1d081d270130e2210a1de59f9715de033307d068edc65a335b27e95d3d',
    })
    expect(
      repository.disableOtherPushSubscriptionsForDevice,
    ).toHaveBeenCalledWith({
      deviceId: 'portal-device-test-device-1',
      endpoint: 'https://push.example.test/subscription/1',
      now: new Date('2026-05-23T00:00:00.000Z'),
      portalUserId: 7,
    })
    expect(
      repository.disableOtherPushSubscriptionsForEndpoint,
    ).toHaveBeenCalledWith({
      endpoint: 'https://push.example.test/subscription/1',
      now: new Date('2026-05-23T00:00:00.000Z'),
      portalUserId: 7,
    })
  })

  it('marks the current browser subscription disabled', async () => {
    const repository = createRepository()
    const service = createPushSubscriptionService({
      now: () => new Date('2026-05-23T00:00:00.000Z'),
      repository,
      vapidConfig,
    })

    await service.disableSubscription({
      endpoint: 'https://push.example.test/subscription/1',
      portalUserId: 7,
    })

    expect(repository.disablePushSubscription).toHaveBeenCalledWith({
      endpoint: 'https://push.example.test/subscription/1',
      now: new Date('2026-05-23T00:00:00.000Z'),
      portalUserId: 7,
    })
  })
})
