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
    postMessage?: (message: unknown, transfer?: Transferable[]) => void
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

function markClientPushReady(
  listener: Listener,
  clientId: string,
  activeThreadId: string | null = null,
) {
  listener({
    data: {
      activeThreadId,
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

    expect(postMessage).toHaveBeenCalledWith(
      {
        payload: {
          chatwootMessageId: null,
          notificationTag: 'portal-chat-message-default-9003',
          tenantSlug: 'default',
          threadId: 'group:155',
          threadTitle: 'ООО Уточки',
          threadType: 'group',
          type: 'chat_message',
          url: '/',
        },
        type: 'PORTAL_PUSH_MESSAGE',
      },
      expect.arrayContaining([expect.any(MessagePort)]),
    )
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
          tenantSlug: 'default',
          threadId: 'group:155',
          threadTitle: 'ООО Уточки',
          threadType: 'group',
          type: 'chat_message',
          url: '/',
        },
        type: 'PORTAL_PUSH_MESSAGE',
      },
      expect.arrayContaining([expect.any(MessagePort)]),
    )
    expect(showNotification).not.toHaveBeenCalled()
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
        body: 'Новое сообщение в групповом чате',
        tag: 'portal-chat-message-default-9006',
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
})
