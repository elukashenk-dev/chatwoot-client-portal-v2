import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

type Listener = (event: {
  data?: unknown
  source?: { id?: string }
  waitUntil?: (promise: Promise<unknown>) => void
}) => void

function loadServiceWorker({
  clientsList = [],
}: {
  clientsList?: Array<{
    focused?: boolean
    id: string
    postMessage?: (message: unknown) => void
    url: string
    visibilityState?: string
  }>
} = {}) {
  const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')
  const listeners = new Map<string, Listener[]>()
  const showNotification = vi.fn(async () => undefined)
  const serviceWorkerScope = {
    addEventListener: vi.fn((eventName: string, listener: Listener) => {
      listeners.set(eventName, [...(listeners.get(eventName) ?? []), listener])
    }),
    location: {
      origin: 'https://lk.provgroup.ru',
    },
    registration: {
      showNotification,
    },
  }
  const clientsScope = {
    matchAll: vi.fn(async () => clientsList),
  }
  const cachesScope = {
    open: vi.fn(),
  }

  new Function('self', 'caches', 'clients', 'Response', 'URL', 'fetch', source)(
    serviceWorkerScope,
    cachesScope,
    clientsScope,
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

function markClientPushReady(listener: Listener, clientId: string) {
  listener({
    data: {
      type: 'PORTAL_PUSH_CLIENT_READY',
    },
    source: {
      id: clientId,
    },
  })
}

describe('service worker push notifications', () => {
  it('uses payload notification tags so pending notifications do not collapse new messages', async () => {
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
      notificationTag: 'portal-chat-message-default-9002',
      tenantSlug: 'default',
      type: 'chat_message',
      url: '/',
    })

    expect(showNotification).toHaveBeenNthCalledWith(
      1,
      'Новое сообщение',
      expect.objectContaining({
        tag: 'portal-chat-message-default-9001',
      }),
    )
    expect(showNotification).toHaveBeenNthCalledWith(
      2,
      'Новое сообщение',
      expect.objectContaining({
        tag: 'portal-chat-message-default-9002',
      }),
    )
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

    markClientPushReady(messageListener!, 'client-1')
    await dispatchPush(pushListener!, {
      notificationTag: 'portal-chat-message-default-9003',
      tenantSlug: 'default',
      type: 'chat_message',
      url: '/',
    })

    expect(postMessage).not.toHaveBeenCalled()
    expect(showNotification).toHaveBeenCalledWith(
      'Новое сообщение',
      expect.objectContaining({
        tag: 'portal-chat-message-default-9003',
      }),
    )
  })

  it('posts to the push-ready portal client instead of showing a system notification when the client is visible', async () => {
    const postMessage = vi.fn()
    const { listeners, showNotification } = loadServiceWorker({
      clientsList: [
        {
          focused: true,
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

    markClientPushReady(messageListener!, 'client-1')
    await dispatchPush(pushListener!, {
      notificationTag: 'portal-chat-message-default-9004',
      tenantSlug: 'default',
      type: 'chat_message',
      url: '/',
    })

    expect(postMessage).toHaveBeenCalledWith({
      payload: {
        notificationTag: 'portal-chat-message-default-9004',
        tenantSlug: 'default',
        type: 'chat_message',
        url: '/',
      },
      type: 'PORTAL_PUSH_MESSAGE',
    })
    expect(showNotification).not.toHaveBeenCalled()
  })
})
