import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  deletePushSubscription,
  getChatNotificationSettings,
  getPushPublicKey,
  getUserNotificationSettings,
  savePushSubscription,
  updateChatNotificationSettings,
  updateUserNotificationSettings,
} from './chatClient'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
    },
    status,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('chat notification API client', () => {
  it('loads global notification settings', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        newMessagesEnabled: true,
        pushEnabled: false,
        soundEnabled: true,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getUserNotificationSettings()).resolves.toEqual({
      newMessagesEnabled: true,
      pushEnabled: false,
      soundEnabled: true,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/notifications/settings',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      }),
    )
  })

  it('patches partial global notification settings', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        newMessagesEnabled: true,
        pushEnabled: false,
        soundEnabled: false,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await updateUserNotificationSettings({ soundEnabled: false })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/notifications/settings',
      expect.objectContaining({
        body: JSON.stringify({ soundEnabled: false }),
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      }),
    )
  })

  it('encodes chat thread ids and sends null overrides', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        effective: {
          newMessagesEnabled: true,
          pushEnabled: false,
          soundEnabled: true,
        },
        global: {
          newMessagesEnabled: true,
          pushEnabled: false,
          soundEnabled: true,
        },
        overrides: {
          newMessagesEnabled: null,
          pushEnabled: null,
          soundEnabled: null,
        },
        threadId: 'group:155',
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await getChatNotificationSettings('group:155')
    await updateChatNotificationSettings('group:155', {
      pushEnabled: null,
      soundEnabled: false,
    })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/chat/threads/group%3A155/notification-settings',
      expect.objectContaining({
        method: 'GET',
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/chat/threads/group%3A155/notification-settings',
      expect.objectContaining({
        body: JSON.stringify({
          pushEnabled: null,
          soundEnabled: false,
        }),
        method: 'PATCH',
      }),
    )
  })

  it('handles unavailable public push key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        available: false,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getPushPublicKey()).resolves.toEqual({
      available: false,
    })
  })

  it('saves and deletes browser push subscriptions', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await savePushSubscription({
      endpoint: 'https://push.example.test/subscription',
      expirationTime: null,
      keys: {
        auth: 'auth-secret',
        p256dh: 'p256dh-key',
      },
    })
    await deletePushSubscription('https://push.example.test/subscription')

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/notifications/push/subscriptions',
      expect.objectContaining({
        body: JSON.stringify({
          endpoint: 'https://push.example.test/subscription',
          keys: {
            auth: 'auth-secret',
            p256dh: 'p256dh-key',
          },
        }),
        method: 'POST',
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/notifications/push/subscriptions',
      expect.objectContaining({
        body: JSON.stringify({
          endpoint: 'https://push.example.test/subscription',
        }),
        method: 'DELETE',
      }),
    )
  })
})
