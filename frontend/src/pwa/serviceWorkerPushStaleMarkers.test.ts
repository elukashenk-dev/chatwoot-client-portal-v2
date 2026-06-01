import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearAppBadgeDatabase,
  createServiceWorkerIndexedDbFake,
  dispatchPush,
  loadServiceWorker,
} from './serviceWorkerAsset.testSupport'

describe('service worker push stale markers', () => {
  beforeEach(async () => {
    await clearAppBadgeDatabase()
  })

  it('persists push stale marker only when payload has tenant and portal user binding', async () => {
    const indexedDbFake = createServiceWorkerIndexedDbFake()
    const { listeners, showNotification } = loadServiceWorker({
      indexedDB: indexedDbFake.indexedDB,
    })
    const pushListener = listeners.get('push')?.[0]

    expect(pushListener).toBeDefined()

    await dispatchPush(pushListener!, {
      chatwootMessageId: 9101,
      notificationTag: 'portal-chat-message-default-9101',
      portalUserId: 7,
      tenantSlug: 'default',
      threadId: 'private:me',
      threadTitle: 'Личный чат',
      threadType: 'private',
      type: 'chat_message',
      url: '/',
    })

    expect(indexedDbFake.createdStores).toEqual(
      new Set([
        'tenant_contexts',
        'last_active_identities',
        'local_device_signouts',
        'auth_snapshots',
        'chat_thread_lists',
        'chat_message_snapshots',
        'chat_message_pages',
        'chat_text_outbox',
        'sync_leases',
        'push_stale_markers',
      ]),
    )
    expect(indexedDbFake.putCalls).toEqual([
      {
        key: 'default:7:private:me:9101',
        storeName: 'push_stale_markers',
        value: {
          chatwootMessageId: 9101,
          createdAt: expect.any(String),
          tenantSlug: 'default',
          threadId: 'private:me',
          userId: 7,
        },
      },
    ])
    expect(showNotification).toHaveBeenCalledWith(
      'Личный чат',
      expect.objectContaining({
        body: 'Новое сообщение в личном чате',
        tag: 'portal-chat-message-default-9101',
      }),
    )
  })

  it('does not persist push stale marker without portalUserId', async () => {
    const indexedDbFake = createServiceWorkerIndexedDbFake()
    const { listeners } = loadServiceWorker({
      indexedDB: indexedDbFake.indexedDB,
    })
    const pushListener = listeners.get('push')?.[0]

    expect(pushListener).toBeDefined()

    await dispatchPush(pushListener!, {
      chatwootMessageId: 9102,
      notificationTag: 'portal-chat-message-default-9102',
      tenantSlug: 'default',
      threadId: 'private:me',
      threadTitle: 'Личный чат',
      threadType: 'private',
      type: 'chat_message',
      url: '/',
    })

    expect(indexedDbFake.indexedDB.open).not.toHaveBeenCalled()
    expect(indexedDbFake.putCalls).toEqual([])
  })

  it('still shows a system notification when stale marker persistence fails', async () => {
    const indexedDbFake = createServiceWorkerIndexedDbFake({
      failOpen: true,
    })
    const { listeners, showNotification } = loadServiceWorker({
      indexedDB: indexedDbFake.indexedDB,
    })
    const pushListener = listeners.get('push')?.[0]

    expect(pushListener).toBeDefined()

    await dispatchPush(pushListener!, {
      chatwootMessageId: 9103,
      notificationTag: 'portal-chat-message-default-9103',
      portalUserId: 7,
      tenantSlug: 'default',
      threadId: 'private:me',
      threadTitle: 'Личный чат',
      threadType: 'private',
      type: 'chat_message',
      url: '/',
    })

    expect(indexedDbFake.indexedDB.open).toHaveBeenCalled()
    expect(showNotification).toHaveBeenCalledWith(
      'Личный чат',
      expect.objectContaining({
        body: 'Новое сообщение в личном чате',
        tag: 'portal-chat-message-default-9103',
      }),
    )
  })
})
