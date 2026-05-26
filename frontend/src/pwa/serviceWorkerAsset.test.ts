import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

type Listener = (event: {
  data?: { json: () => unknown }
  waitUntil: (promise: Promise<unknown>) => void
}) => void

function loadServiceWorker() {
  const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')
  const listeners = new Map<string, Listener[]>()
  const showNotification = vi.fn(async () => undefined)
  const serviceWorkerScope = {
    addEventListener: vi.fn((eventName: string, listener: Listener) => {
      listeners.set(eventName, [...(listeners.get(eventName) ?? []), listener])
    }),
    registration: {
      showNotification,
    },
  }
  const clientsScope = {
    matchAll: vi.fn(async () => []),
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
})
