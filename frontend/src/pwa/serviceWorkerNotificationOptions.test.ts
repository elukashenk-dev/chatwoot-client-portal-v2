import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

type Listener = (event: {
  data?: unknown
  waitUntil?: (promise: Promise<unknown>) => void
}) => void

function loadServiceWorker() {
  const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')
  const listeners = new Map<string, Listener[]>()
  const showNotification = vi.fn(
    async (title: string, options?: NotificationOptions) => {
      void title
      void options
    },
  )
  const serviceWorkerScope = {
    addEventListener: vi.fn((eventName: string, listener: Listener) => {
      listeners.set(eventName, [...(listeners.get(eventName) ?? []), listener])
    }),
    location: {
      origin: 'https://lk.provgroup.ru',
    },
    registration: {
      getNotifications: vi.fn(async () => []),
      showNotification,
    },
  }

  new Function(
    'self',
    'caches',
    'clients',
    'navigator',
    'indexedDB',
    'Response',
    'URL',
    'fetch',
    source,
  )(
    serviceWorkerScope,
    { open: vi.fn() },
    { matchAll: vi.fn(async () => []) },
    {},
    undefined,
    Response,
    URL,
    vi.fn(),
  )

  return {
    listeners,
    showNotification,
  }
}

async function dispatchPush(
  listener: Listener,
  payload: Record<string, unknown>,
) {
  const promises: Promise<unknown>[] = []

  listener({
    data: {
      json: () => payload,
    },
    waitUntil: (promise) => {
      promises.push(promise)
    },
  })

  await Promise.all(promises)
}

describe('service worker notification options', () => {
  it('does not renotify per-message tagged notifications', async () => {
    const { listeners, showNotification } = loadServiceWorker()
    const pushListener = listeners.get('push')?.[0]

    expect(pushListener).toBeDefined()

    await dispatchPush(pushListener!, {
      notificationTag: 'portal-chat-message-default-9001',
      tenantSlug: 'default',
      type: 'chat_message',
      url: '/',
    })
    await dispatchPush(pushListener!, {
      notificationTag: 'portal-chat-message-default-9001',
      tenantSlug: 'default',
      type: 'chat_message',
      url: '/',
    })

    expect(showNotification).toHaveBeenNthCalledWith(
      1,
      'Новое сообщение',
      expect.objectContaining({
        tag: 'portal-chat-message-default-9001',
        timestamp: expect.any(Number),
      }),
    )
    expect(showNotification).toHaveBeenNthCalledWith(
      2,
      'Новое сообщение',
      expect.objectContaining({
        tag: 'portal-chat-message-default-9001',
        timestamp: expect.any(Number),
      }),
    )
    expect(showNotification.mock.calls[0]?.[1]).not.toHaveProperty('renotify')
    expect(showNotification.mock.calls[1]?.[1]).not.toHaveProperty('renotify')
  })

  it('shows a silent system notification when the push payload disables sound', async () => {
    const { listeners, showNotification } = loadServiceWorker()
    const pushListener = listeners.get('push')?.[0]

    expect(pushListener).toBeDefined()

    await dispatchPush(pushListener!, {
      notificationTag: 'portal-chat-message-default-9002',
      soundEnabled: false,
      tenantSlug: 'default',
      type: 'chat_message',
      url: '/',
    })

    expect(showNotification).toHaveBeenCalledWith(
      'Новое сообщение',
      expect.objectContaining({
        silent: true,
        tag: 'portal-chat-message-default-9002',
      }),
    )
  })
})
