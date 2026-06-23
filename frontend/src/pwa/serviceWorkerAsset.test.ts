import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearAppBadgeDatabase,
  createCacheWithResponses,
  dispatchPush,
  loadServiceWorker,
  markClientPushReady,
  waitForTextOrTimeout,
} from './serviceWorkerAsset.testSupport'

describe('service worker push notifications', () => {
  beforeEach(async () => {
    await clearAppBadgeDatabase()
  })

  it('sets an exact app icon badge count when a system notification is shown', async () => {
    const setAppBadge = vi.fn(async () => undefined)
    const { listeners, showNotification } = loadServiceWorker({
      appBadge: {
        setAppBadge,
      },
    })
    const pushListener = listeners.get('push')?.[0]

    expect(pushListener).toBeDefined()

    await dispatchPush(pushListener!, {
      notificationTag: 'portal-chat-message-default-9010',
      tenantSlug: 'default',
      totalUnreadCount: 1,
      type: 'chat_message',
      url: '/',
    })

    expect(showNotification).toHaveBeenCalled()
    expect(setAppBadge).toHaveBeenCalledWith(1)
  })

  it('uses the exact unread count from each shown system notification', async () => {
    const setAppBadge = vi.fn(async () => undefined)
    const { listeners } = loadServiceWorker({
      appBadge: {
        setAppBadge,
      },
    })
    const pushListener = listeners.get('push')?.[0]

    expect(pushListener).toBeDefined()

    await dispatchPush(pushListener!, {
      notificationTag: 'portal-chat-message-default-9010',
      tenantSlug: 'default',
      totalUnreadCount: 1,
      type: 'chat_message',
      url: '/',
    })
    await dispatchPush(pushListener!, {
      notificationTag: 'portal-chat-message-default-9011',
      tenantSlug: 'default',
      totalUnreadCount: 2,
      type: 'chat_message',
      url: '/',
    })

    expect(setAppBadge).toHaveBeenNthCalledWith(1, 1)
    expect(setAppBadge).toHaveBeenNthCalledWith(2, 2)
  })

  it('serializes concurrent exact app icon badge count writes', async () => {
    const setAppBadge = vi.fn(async () => undefined)
    const { listeners } = loadServiceWorker({
      appBadge: {
        setAppBadge,
      },
    })
    const pushListener = listeners.get('push')?.[0]

    expect(pushListener).toBeDefined()

    await Promise.all([
      dispatchPush(pushListener!, {
        notificationTag: 'portal-chat-message-default-9014',
        tenantSlug: 'default',
        totalUnreadCount: 1,
        type: 'chat_message',
        url: '/',
      }),
      dispatchPush(pushListener!, {
        notificationTag: 'portal-chat-message-default-9015',
        tenantSlug: 'default',
        totalUnreadCount: 2,
        type: 'chat_message',
        url: '/',
      }),
    ])

    expect(setAppBadge).toHaveBeenNthCalledWith(1, 1)
    expect(setAppBadge).toHaveBeenNthCalledWith(2, 2)
  })

  it('resets the local app icon badge count after a clear message', async () => {
    const clearAppBadge = vi.fn(async () => undefined)
    const setAppBadge = vi.fn(async () => undefined)
    const { listeners } = loadServiceWorker({
      appBadge: {
        clearAppBadge,
        setAppBadge,
      },
    })
    const messageListener = listeners.get('message')?.[0]
    const pushListener = listeners.get('push')?.[0]

    expect(messageListener).toBeDefined()
    expect(pushListener).toBeDefined()

    await dispatchPush(pushListener!, {
      notificationTag: 'portal-chat-message-default-9012',
      tenantSlug: 'default',
      totalUnreadCount: 1,
      type: 'chat_message',
      url: '/',
    })
    messageListener!({
      data: {
        type: 'PORTAL_APP_BADGE_CLEAR',
      },
      source: {
        id: 'client-1',
      },
    })
    await dispatchPush(pushListener!, {
      notificationTag: 'portal-chat-message-default-9013',
      tenantSlug: 'default',
      totalUnreadCount: 1,
      type: 'chat_message',
      url: '/',
    })

    expect(setAppBadge).toHaveBeenNthCalledWith(1, 1)
    expect(setAppBadge).toHaveBeenNthCalledWith(2, 1)
    expect(clearAppBadge).not.toHaveBeenCalled()
  })

  it('closes pending portal chat notifications after a clear message', async () => {
    const chatNotification = {
      close: vi.fn(),
      tag: 'portal-chat-message-default-9001',
    }
    const legacyThreadNotification = {
      close: vi.fn(),
      tag: 'portal-chat-thread-default-private-me',
    }
    const legacyUnreadNotification = {
      close: vi.fn(),
      tag: 'portal-chat-unread-default',
    }
    const unrelatedNotification = {
      close: vi.fn(),
      tag: 'external-notification',
    }
    const { listeners } = loadServiceWorker({
      notifications: [
        chatNotification,
        legacyThreadNotification,
        legacyUnreadNotification,
        unrelatedNotification,
      ],
    })
    const messageListener = listeners.get('message')?.[0]
    const pendingPromises: Promise<unknown>[] = []

    expect(messageListener).toBeDefined()

    messageListener!({
      data: {
        type: 'PORTAL_APP_BADGE_CLEAR',
      },
      waitUntil: (promise) => {
        pendingPromises.push(promise)
      },
    })

    await Promise.all(pendingPromises)

    expect(chatNotification.close).toHaveBeenCalledTimes(1)
    expect(legacyThreadNotification.close).not.toHaveBeenCalled()
    expect(legacyUnreadNotification.close).not.toHaveBeenCalled()
    expect(unrelatedNotification.close).not.toHaveBeenCalled()
  })

  it('closes only pending portal chat notifications for the opened thread', async () => {
    const openedThreadNotification = {
      close: vi.fn(),
      data: {
        threadId: 'group:155',
      },
      tag: 'portal-chat-message-default-9001',
    }
    const otherThreadNotification = {
      close: vi.fn(),
      data: {
        threadId: 'private:me',
      },
      tag: 'portal-chat-message-default-9002',
    }
    const unrelatedNotification = {
      close: vi.fn(),
      data: {
        threadId: 'group:155',
      },
      tag: 'external-notification',
    }
    const { listeners } = loadServiceWorker({
      notifications: [
        openedThreadNotification,
        otherThreadNotification,
        unrelatedNotification,
      ],
    })
    const messageListener = listeners.get('message')?.[0]
    const pendingPromises: Promise<unknown>[] = []

    expect(messageListener).toBeDefined()

    messageListener!({
      data: {
        threadId: 'group:155',
        type: 'PORTAL_CHAT_THREAD_NOTIFICATIONS_CLEAR',
      },
      waitUntil: (promise) => {
        pendingPromises.push(promise)
      },
    })

    await Promise.all(pendingPromises)

    expect(openedThreadNotification.close).toHaveBeenCalledTimes(1)
    expect(otherThreadNotification.close).not.toHaveBeenCalled()
    expect(unrelatedNotification.close).not.toHaveBeenCalled()
  })

  it('shows a system notification when the push-ready portal client is hidden', async () => {
    const postMessage = vi.fn()
    const { listeners, showNotification } = loadServiceWorker({
      clientsList: [
        {
          focused: true,
          id: 'client-1',
          postMessage,
          url: 'https://lk.provgroup.ru/app',
          visibilityState: 'hidden',
        },
      ],
    })
    const messageListener = listeners.get('message')?.[0]
    const pushListener = listeners.get('push')?.[0]

    expect(messageListener).toBeDefined()
    expect(pushListener).toBeDefined()

    markClientPushReady(messageListener!, 'client-1', 'group:155')
    await dispatchPush(pushListener!, {
      notificationTag: 'portal-chat-message-default-9003',
      tenantSlug: 'default',
      threadId: 'group:155',
      threadTitle: 'ООО Уточки',
      threadType: 'group',
      type: 'chat_message',
      url: '/',
    })

    expect(postMessage).not.toHaveBeenCalled()
    expect(showNotification).toHaveBeenCalledWith(
      'ООО Уточки',
      expect.objectContaining({
        body: 'Новое сообщение в групповом чате',
        tag: 'portal-chat-message-default-9003',
      }),
    )
  })

  it('lets a visible push-ready portal client suppress the system notification after it handles the push', async () => {
    const postMessage = vi.fn(
      (_message: unknown, transfer?: Transferable[]) => {
        const [responsePort] = transfer ?? []
        if (responsePort instanceof MessagePort) {
          responsePort.postMessage({
            handled: true,
          })
        }
      },
    )
    const { listeners, showNotification } = loadServiceWorker({
      clientsList: [
        {
          focused: false,
          id: 'client-1',
          postMessage,
          url: 'https://lk.provgroup.ru/app',
          visibilityState: 'visible',
        },
      ],
    })
    const messageListener = listeners.get('message')?.[0]
    const pushListener = listeners.get('push')?.[0]

    expect(messageListener).toBeDefined()
    expect(pushListener).toBeDefined()

    markClientPushReady(messageListener!, 'client-1', 'group:155')
    await dispatchPush(pushListener!, {
      notificationTag: 'portal-chat-message-default-9004',
      chatwootMessageId: 9004,
      portalUserId: 7,
      soundEnabled: false,
      tenantSlug: 'default',
      threadId: 'group:155',
      threadTitle: 'ООО Уточки',
      threadType: 'group',
      type: 'chat_message',
      url: '/',
    })

    expect(postMessage).toHaveBeenCalledWith(
      {
        payload: {
          chatwootMessageId: 9004,
          notificationTag: 'portal-chat-message-default-9004',
          portalUserId: 7,
          soundEnabled: false,
          tenantSlug: 'default',
          threadId: 'group:155',
          threadTitle: 'ООО Уточки',
          threadType: 'group',
          threadUnreadCount: null,
          totalUnreadCount: null,
          type: 'chat_message',
          url: '/',
        },
        type: 'PORTAL_PUSH_MESSAGE',
      },
      expect.arrayContaining([expect.any(MessagePort)]),
    )
    expect(showNotification).not.toHaveBeenCalled()
  })

  it('does not set an app icon badge when a visible client suppresses the system notification', async () => {
    const setAppBadge = vi.fn(async () => undefined)
    const postMessage = vi.fn(
      (_message: unknown, transfer?: Transferable[]) => {
        const [responsePort] = transfer ?? []
        if (responsePort instanceof MessagePort) {
          responsePort.postMessage({
            handled: true,
          })
        }
      },
    )
    const { listeners, showNotification } = loadServiceWorker({
      appBadge: {
        setAppBadge,
      },
      clientsList: [
        {
          focused: false,
          id: 'client-1',
          postMessage,
          url: 'https://lk.provgroup.ru/app',
          visibilityState: 'visible',
        },
      ],
    })
    const messageListener = listeners.get('message')?.[0]
    const pushListener = listeners.get('push')?.[0]

    expect(messageListener).toBeDefined()
    expect(pushListener).toBeDefined()

    markClientPushReady(messageListener!, 'client-1', 'group:155')
    await dispatchPush(pushListener!, {
      chatwootMessageId: 9011,
      notificationTag: 'portal-chat-message-default-9011',
      tenantSlug: 'default',
      threadId: 'group:155',
      threadTitle: 'ООО Уточки',
      threadType: 'group',
      type: 'chat_message',
      url: '/',
    })

    expect(showNotification).not.toHaveBeenCalled()
    expect(setAppBadge).not.toHaveBeenCalled()
  })

  it('shows a system notification when the visible portal client reports that another chat is active', async () => {
    const postMessage = vi.fn(
      (_message: unknown, transfer?: Transferable[]) => {
        const [responsePort] = transfer ?? []
        if (responsePort instanceof MessagePort) {
          responsePort.postMessage({
            handled: false,
          })
        }
      },
    )
    const { listeners, showNotification } = loadServiceWorker({
      clientsList: [
        {
          focused: false,
          id: 'client-1',
          postMessage,
          url: 'https://lk.provgroup.ru/app',
          visibilityState: 'visible',
        },
      ],
    })
    const messageListener = listeners.get('message')?.[0]
    const pushListener = listeners.get('push')?.[0]

    expect(messageListener).toBeDefined()
    expect(pushListener).toBeDefined()

    markClientPushReady(messageListener!, 'client-1', 'private:me')
    await dispatchPush(pushListener!, {
      chatwootMessageId: 9005,
      notificationTag: 'portal-chat-message-default-9005',
      tenantSlug: 'default',
      threadId: 'group:155',
      threadTitle: 'ООО Уточки',
      threadType: 'group',
      type: 'chat_message',
      url: '/',
    })

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          chatwootMessageId: 9005,
          threadId: 'group:155',
          threadTitle: 'ООО Уточки',
          threadType: 'group',
        }),
        type: 'PORTAL_PUSH_MESSAGE',
      }),
      expect.arrayContaining([expect.any(MessagePort)]),
    )
    expect(showNotification).toHaveBeenCalledWith(
      'ООО Уточки',
      expect.objectContaining({
        body: 'Новое сообщение в групповом чате',
        tag: 'portal-chat-message-default-9005',
      }),
    )
  })

  it('stores the thread id in system notification data', async () => {
    const { listeners, showNotification } = loadServiceWorker()
    const pushListener = listeners.get('push')?.[0]

    expect(pushListener).toBeDefined()

    await dispatchPush(pushListener!, {
      chatwootMessageId: 9010,
      notificationTag: 'portal-chat-message-default-9010',
      tenantSlug: 'default',
      threadId: 'group:155',
      threadTitle: 'ООО Уточки',
      threadType: 'group',
      type: 'chat_message',
      url: '/app/chat?threadId=group%3A155',
    })

    expect(showNotification).toHaveBeenCalledWith(
      'ООО Уточки',
      expect.objectContaining({
        data: {
          threadId: 'group:155',
          url: '/app/chat?threadId=group%3A155',
        },
      }),
    )
  })

  it('navigates an existing portal client to the notification chat url before focusing it', async () => {
    const focus = vi.fn(async () => null)
    const navigate = vi.fn(async () => ({
      focus,
    }))
    const { listeners } = loadServiceWorker({
      clientsList: [
        {
          focus: vi.fn(async () => null),
          id: 'client-1',
          navigate,
          url: 'https://lk.provgroup.ru/app/settings',
          visibilityState: 'hidden',
        },
      ],
    })
    const notificationClickListener = listeners.get('notificationclick')?.[0]
    const pendingPromises: Promise<unknown>[] = []
    const close = vi.fn()

    expect(notificationClickListener).toBeDefined()

    notificationClickListener!({
      notification: {
        close,
        data: {
          url: '/app/chat?threadId=group%3A155',
        },
      },
      waitUntil: (promise) => {
        pendingPromises.push(promise)
      },
    })

    await Promise.all(pendingPromises)

    expect(close).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith(
      'https://lk.provgroup.ru/app/chat?threadId=group%3A155',
    )
    expect(focus).toHaveBeenCalledTimes(1)
  })

  it('does not let a visible portal client suppress a push for another active chat', async () => {
    const postMessage = vi.fn(
      (_message: unknown, transfer?: Transferable[]) => {
        const [responsePort] = transfer ?? []
        if (responsePort instanceof MessagePort) {
          responsePort.postMessage({
            handled: true,
          })
        }
      },
    )
    const { listeners, showNotification } = loadServiceWorker({
      clientsList: [
        {
          focused: false,
          id: 'client-1',
          postMessage,
          url: 'https://lk.provgroup.ru/app',
          visibilityState: 'visible',
        },
      ],
    })
    const messageListener = listeners.get('message')?.[0]
    const pushListener = listeners.get('push')?.[0]

    expect(messageListener).toBeDefined()
    expect(pushListener).toBeDefined()

    markClientPushReady(messageListener!, 'client-1', 'private:me')
    await dispatchPush(pushListener!, {
      chatwootMessageId: 9006,
      notificationTag: 'portal-chat-message-default-9006',
      tenantSlug: 'default',
      threadId: 'group:155',
      threadTitle: 'ООО Уточки',
      threadType: 'group',
      threadUnreadCount: 4,
      type: 'chat_message',
      url: '/',
    })

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          chatwootMessageId: 9006,
          threadId: 'group:155',
          threadTitle: 'ООО Уточки',
          threadType: 'group',
        }),
        type: 'PORTAL_PUSH_MESSAGE',
      }),
      expect.arrayContaining([expect.any(MessagePort)]),
    )
    expect(showNotification).toHaveBeenCalledWith(
      'ООО Уточки',
      expect.objectContaining({
        body: '4 новых сообщения в группе',
        tag: 'portal-chat-message-default-9006',
      }),
    )
  })

  it('uses unread count in private chat system notification copy', async () => {
    const { listeners, showNotification } = loadServiceWorker()
    const pushListener = listeners.get('push')?.[0]

    expect(pushListener).toBeDefined()

    await dispatchPush(pushListener!, {
      chatwootMessageId: 9009,
      notificationTag: 'portal-chat-message-default-9009',
      tenantSlug: 'default',
      threadId: 'private:me',
      threadTitle: 'Личный чат',
      threadType: 'private',
      threadUnreadCount: 1,
      type: 'chat_message',
      url: '/',
    })

    expect(showNotification).toHaveBeenCalledWith(
      'Личный чат',
      expect.objectContaining({
        body: '1 новое сообщение в личном чате',
        tag: 'portal-chat-message-default-9009',
      }),
    )
  })

  it('uses safe chat title and type in the system notification copy', async () => {
    const { listeners, showNotification } = loadServiceWorker()
    const pushListener = listeners.get('push')?.[0]

    expect(pushListener).toBeDefined()

    await dispatchPush(pushListener!, {
      chatwootMessageId: 9007,
      notificationTag: 'portal-chat-message-default-9007',
      tenantSlug: 'default',
      threadId: 'group:155',
      threadTitle: 'ООО Уточки',
      threadType: 'group',
      type: 'chat_message',
      url: '/',
    })

    expect(showNotification).toHaveBeenCalledWith(
      'ООО Уточки',
      expect.objectContaining({
        body: 'Новое сообщение в групповом чате',
        tag: 'portal-chat-message-default-9007',
      }),
    )
  })

  it('falls back to generic copy when chat metadata is unavailable', async () => {
    const { listeners, showNotification } = loadServiceWorker()
    const pushListener = listeners.get('push')?.[0]

    expect(pushListener).toBeDefined()

    await dispatchPush(pushListener!, {
      chatwootMessageId: 9008,
      notificationTag: 'portal-chat-message-default-9008',
      tenantSlug: 'default',
      threadId: 'group:155',
      threadTitle: null,
      threadType: null,
      type: 'chat_message',
      url: '/',
    })

    expect(showNotification).toHaveBeenCalledWith(
      'Новое сообщение',
      expect.objectContaining({
        body: 'Откройте портал, чтобы посмотреть чат.',
        tag: 'portal-chat-message-default-9008',
      }),
    )
  })

  it('keeps non-avatar API routes out of service worker fetch handling', () => {
    const { listeners } = loadServiceWorker()
    const fetchListener = listeners.get('fetch')?.[0]
    const request = {
      destination: '',
      method: 'GET',
      mode: 'cors',
      url: 'https://lk.provgroup.ru/api/chat/messages',
    } as unknown as Request
    const respondWith = vi.fn()

    expect(fetchListener).toBeDefined()

    fetchListener!({
      request,
      respondWith,
      waitUntil: vi.fn(),
    })

    expect(respondWith).not.toHaveBeenCalled()
  })

  it('keeps attachment API routes out of service worker fetch handling', () => {
    const { listeners } = loadServiceWorker()
    const fetchListener = listeners.get('fetch')?.[0]
    const request = {
      destination: 'image',
      method: 'GET',
      mode: 'no-cors',
      url: 'https://lk.provgroup.ru/api/chat/threads/group%3A154/attachments/501/91',
    } as unknown as Request
    const respondWith = vi.fn()

    expect(fetchListener).toBeDefined()

    fetchListener!({
      request,
      respondWith,
      waitUntil: vi.fn(),
    })

    expect(respondWith).not.toHaveBeenCalled()
  })

  it('serves cached chat avatar proxy images when the network hangs', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      () => new Promise<Response>(() => {}),
    )
    const cachedAvatar = new Response('cached-avatar-bytes', {
      headers: {
        'Cache-Control': 'private, max-age=86400',
        'Content-Type': 'image/png',
      },
      status: 200,
    })
    const cache = createCacheWithResponses({
      '/api/chat/threads/group%3A154/participants/8/avatar': cachedAvatar,
    })
    const { listeners } = loadServiceWorker({
      cacheStorage: {
        open: vi.fn(async () => cache as unknown as Cache),
      },
      fetch,
    })
    const fetchListener = listeners.get('fetch')?.[0]
    const request = {
      destination: 'image',
      method: 'GET',
      mode: 'no-cors',
      url: 'https://lk.provgroup.ru/api/chat/threads/group%3A154/participants/8/avatar',
    } as unknown as Request
    let responsePromise: Promise<Response> | null = null

    expect(fetchListener).toBeDefined()

    fetchListener!({
      request,
      respondWith: (response) => {
        responsePromise = Promise.resolve(response)
      },
      waitUntil: vi.fn(),
    })

    expect(responsePromise).not.toBeNull()
    await expect(waitForTextOrTimeout(responsePromise!)).resolves.toBe(
      'cached-avatar-bytes',
    )
    expect(fetch).toHaveBeenCalledWith(request)
  })

  it('serves the cached app shell immediately when navigation network hangs', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      () => new Promise<Response>(() => {}),
    )
    const cachedShell = new Response('<html>cached app shell</html>', {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
      status: 200,
    })
    const cache = createCacheWithResponses({
      '/': cachedShell,
    })
    const { listeners } = loadServiceWorker({
      cacheStorage: {
        open: vi.fn(async () => cache as unknown as Cache),
      },
      fetch,
    })
    const fetchListener = listeners.get('fetch')?.[0]
    const request = {
      destination: '',
      method: 'GET',
      mode: 'navigate',
      url: 'https://lk.provgroup.ru/app/chat',
    } as unknown as Request
    let responsePromise: Promise<Response> | null = null

    expect(fetchListener).toBeDefined()

    fetchListener!({
      request,
      respondWith: (response) => {
        responsePromise = Promise.resolve(response)
      },
      waitUntil: vi.fn(),
    })

    expect(responsePromise).not.toBeNull()
    await expect(waitForTextOrTimeout(responsePromise!)).resolves.toBe(
      '<html>cached app shell</html>',
    )
    expect(fetch).toHaveBeenCalledWith(request)
  })

  it('declares stamped build assets and default branding images in the app shell', () => {
    const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

    expect(source).toContain('__PORTAL_SERVICE_WORKER_ASSETS_JSON__')
    expect(source).toContain('/default-branding/auth-header.png')
    expect(source).toContain('/default-branding/auth-footer.png')
  })
})
