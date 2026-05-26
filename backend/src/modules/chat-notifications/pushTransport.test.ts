import { describe, expect, it, vi } from 'vitest'
import webPush from 'web-push'

import { createWebPushTransport } from './pushTransport.js'

vi.mock('web-push', () => ({
  default: {
    sendNotification: vi.fn(async () => undefined),
    setVapidDetails: vi.fn(),
  },
}))

const webPushMock = vi.mocked(webPush)

describe('push transport', () => {
  it('configures VAPID details through the default web-push export', async () => {
    const transport = createWebPushTransport({
      keyId: 'production-2026-05',
      privateKey: 'private-key',
      publicKey: 'public-key',
      publicKeyFingerprint: 'sha256-public-key',
      subject: 'mailto:cbr@provgroup.ru',
    })

    await expect(
      transport.sendNotification(
        {
          endpoint: 'https://fcm.googleapis.com/fcm/send/subscription-1',
          keys: {
            auth: 'auth-secret',
            p256dh: 'p256dh-key',
          },
        },
        '{"type":"chat_message"}',
      ),
    ).resolves.toEqual({
      status: 'sent',
    })

    expect(webPushMock.setVapidDetails).toHaveBeenCalledWith(
      'mailto:cbr@provgroup.ru',
      'public-key',
      'private-key',
    )
    expect(webPushMock.sendNotification).toHaveBeenCalledWith(
      {
        endpoint: 'https://fcm.googleapis.com/fcm/send/subscription-1',
        keys: {
          auth: 'auth-secret',
          p256dh: 'p256dh-key',
        },
      },
      '{"type":"chat_message"}',
      {
        TTL: 86_400,
        urgency: 'high',
      },
    )
  })
})
