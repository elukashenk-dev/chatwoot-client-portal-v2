import { expect, type Page } from '@playwright/test'

const OFFLINE_STORE_NAMES = [
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
] as const

export type BrowserLastActiveIdentity = {
  tenantSlug: string
  userId: number
}

type BrowserOutboxKey = {
  clientMessageKey: string
  tenantSlug: string
  threadId: string
  userId: number
}

export type BrowserOutboxRecord = {
  attemptCount: number
  clientMessageKey: string
  content: string
  createdAt: string
  errorCode: string | null
  errorMessage: string | null
  lastAttemptAt: string | null
  nextAttemptAt: string | null
  replyTo: null
  replyToMessageId: null
  sendOwnerId: string | null
  sendingLeaseExpiresAt: string | null
  sendingStartedAt: string | null
  status: 'queued' | 'sending'
  tenantSlug: string
  threadId: string
  updatedAt: string
  userId: number
}

async function openOfflineDatabase(page: Page) {
  return page.evaluate(
    async ({ storeNames }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('portal-offline', 2)

        request.onupgradeneeded = () => {
          const database = request.result

          for (const storeName of storeNames) {
            if (!database.objectStoreNames.contains(storeName)) {
              database.createObjectStore(storeName)
            }
          }
        }
        request.onsuccess = () => {
          resolve(request.result)
        }
        request.onerror = () => {
          reject(request.error)
        }
      })

      database.close()
    },
    { storeNames: OFFLINE_STORE_NAMES },
  )
}

export async function readLastActiveIdentity(page: Page) {
  await openOfflineDatabase(page)

  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('portal-offline', 2)

      request.onsuccess = () => {
        resolve(request.result)
      }
      request.onerror = () => {
        reject(request.error)
      }
    })

    return new Promise<BrowserLastActiveIdentity>((resolve, reject) => {
      const transaction = database.transaction(
        'last_active_identities',
        'readonly',
      )
      const cursorRequest = transaction
        .objectStore('last_active_identities')
        .openCursor()

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result

        if (!cursor) {
          reject(new Error('Missing last active offline identity.'))
          return
        }

        const value = cursor.value as BrowserLastActiveIdentity
        resolve({
          tenantSlug: value.tenantSlug,
          userId: value.userId,
        })
      }
      cursorRequest.onerror = () => {
        reject(cursorRequest.error)
      }
      transaction.oncomplete = () => {
        database.close()
      }
      transaction.onabort = () => {
        database.close()
      }
    })
  })
}

export async function readOutboxRecord(page: Page, record: BrowserOutboxKey) {
  await openOfflineDatabase(page)

  return page.evaluate(async (outboxRecord) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('portal-offline', 2)

      request.onsuccess = () => {
        resolve(request.result)
      }
      request.onerror = () => {
        reject(request.error)
      }
    })

    return new Promise<BrowserOutboxRecord | null>((resolve, reject) => {
      const transaction = database.transaction('chat_text_outbox', 'readonly')
      const key = `${outboxRecord.tenantSlug}:${outboxRecord.userId}:${outboxRecord.threadId}:${outboxRecord.clientMessageKey}`
      const request = transaction.objectStore('chat_text_outbox').get(key)

      request.onsuccess = () => {
        resolve((request.result as BrowserOutboxRecord | undefined) ?? null)
      }
      request.onerror = () => {
        reject(request.error)
      }
      transaction.oncomplete = () => {
        database.close()
      }
      transaction.onerror = () => {
        database.close()
        reject(transaction.error)
      }
      transaction.onabort = () => {
        database.close()
        reject(transaction.error)
      }
    })
  }, record)
}

export async function readOutboxRecordByContent(
  page: Page,
  identity: BrowserLastActiveIdentity,
  content: string,
) {
  await openOfflineDatabase(page)

  return page.evaluate(
    async ({ expectedContent, userIdentity }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('portal-offline', 2)

        request.onsuccess = () => {
          resolve(request.result)
        }
        request.onerror = () => {
          reject(request.error)
        }
      })

      return new Promise<BrowserOutboxRecord | null>((resolve, reject) => {
        const transaction = database.transaction('chat_text_outbox', 'readonly')
        const request = transaction.objectStore('chat_text_outbox').getAll()

        request.onsuccess = () => {
          const records = request.result as BrowserOutboxRecord[]
          const record =
            records.find(
              (record) =>
                record.tenantSlug === userIdentity.tenantSlug &&
                record.userId === userIdentity.userId &&
                record.threadId === 'private:me' &&
                record.content === expectedContent,
            ) ?? null

          resolve(record)
        }
        request.onerror = () => {
          reject(request.error)
        }
        transaction.oncomplete = () => {
          database.close()
        }
        transaction.onerror = () => {
          database.close()
          reject(transaction.error)
        }
        transaction.onabort = () => {
          database.close()
          reject(transaction.error)
        }
      })
    },
    {
      expectedContent: content,
      userIdentity: identity,
    },
  )
}

export async function seedOutboxRecord(
  page: Page,
  record: BrowserOutboxRecord,
) {
  await openOfflineDatabase(page)

  await page.evaluate(async (outboxRecord) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('portal-offline', 2)

      request.onsuccess = () => {
        resolve(request.result)
      }
      request.onerror = () => {
        reject(request.error)
      }
    })

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('chat_text_outbox', 'readwrite')
      const key = `${outboxRecord.tenantSlug}:${outboxRecord.userId}:${outboxRecord.threadId}:${outboxRecord.clientMessageKey}`

      transaction.objectStore('chat_text_outbox').put(outboxRecord, key)
      transaction.oncomplete = () => {
        database.close()
        resolve()
      }
      transaction.onerror = () => {
        database.close()
        reject(transaction.error)
      }
      transaction.onabort = () => {
        database.close()
        reject(transaction.error)
      }
    })
  }, record)
}

export function createSeededOutboxRecord(
  identity: BrowserLastActiveIdentity,
  overrides: Partial<BrowserOutboxRecord>,
): BrowserOutboxRecord {
  const now = new Date().toISOString()

  return {
    attemptCount: 0,
    clientMessageKey: 'portal-send:e2e-seeded',
    content: 'Seeded offline text',
    createdAt: now,
    errorCode: null,
    errorMessage: null,
    lastAttemptAt: null,
    nextAttemptAt: null,
    replyTo: null,
    replyToMessageId: null,
    sendOwnerId: null,
    sendingLeaseExpiresAt: null,
    sendingStartedAt: null,
    status: 'queued',
    tenantSlug: identity.tenantSlug,
    threadId: 'private:me',
    updatedAt: now,
    userId: identity.userId,
    ...overrides,
  }
}

export function countPostsForClientMessageKey(
  postBodies: { clientMessageKey?: string }[],
  clientMessageKey: string,
) {
  return postBodies.filter((body) => body.clientMessageKey === clientMessageKey)
    .length
}

export async function deleteOfflineSavedData(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase('portal-offline')

        request.onsuccess = () => resolve()
        request.onerror = () =>
          reject(request.error ?? new Error('Failed to delete offline DB.'))
        request.onblocked = () =>
          reject(new Error('Offline DB deletion was blocked.'))
      }),
  )

  await page.evaluate(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('portal.startup.')) {
        window.localStorage.removeItem(key)
      }
    }
  })
}

export async function expectStartupChatFallbackSaved(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(window.localStorage).some((key) =>
          key.startsWith('portal.startup.chat:'),
        ),
      ),
    )
    .toBe(true)
}
