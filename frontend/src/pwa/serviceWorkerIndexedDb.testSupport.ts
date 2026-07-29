import { vi } from 'vitest'

type IndexedDbPutCall = {
  key: IDBValidKey | undefined
  storeName: string
  value: unknown
}

type IndexedDbDeleteCall = {
  key: IDBValidKey
  storeName: string
}

type IndexedDbIndexLookup = {
  indexName: string
  key?: IDBValidKey | IDBKeyRange
  operation: 'get' | 'getKey' | 'openKeyCursor'
  storeName: string
}

type IndexedDbCreatedIndex = {
  keyPath: string | string[]
  name: string
  options?: IDBIndexParameters
  storeName: string
}

export function createServiceWorkerIndexedDbFake({
  failOpen = false,
  failPut = false,
  records = {},
}: {
  failOpen?: boolean
  failPut?: boolean
  records?: Record<string, Record<string, unknown>>
} = {}) {
  const putCalls: IndexedDbPutCall[] = []
  const deleteCalls: IndexedDbDeleteCall[] = []
  const getAllCalls: string[] = []
  const primaryCursorCalls: string[] = []
  const indexLookups: IndexedDbIndexLookup[] = []
  const createdStores = new Set<string>()
  const createdStoreOptions = new Map<
    string,
    IDBObjectStoreParameters | undefined
  >()
  const createdIndexes: IndexedDbCreatedIndex[] = []
  const storeRecords = new Map(
    Object.entries(records).map(([storeName, values]) => [
      storeName,
      new Map(Object.entries(values)),
    ]),
  )
  const indexedDB = {
    open: vi.fn(() => {
      const database = {
        close: vi.fn(),
        createObjectStore: vi.fn(
          (storeName: string, options?: IDBObjectStoreParameters) => {
            createdStores.add(storeName)
            createdStoreOptions.set(storeName, options)

            return {
              createIndex: (
                name: string,
                keyPath: string | string[],
                indexOptions?: IDBIndexParameters,
              ) => {
                createdIndexes.push({
                  keyPath,
                  name,
                  options: indexOptions,
                  storeName,
                })
              },
            }
          },
        ),
        objectStoreNames: {
          contains: (storeName: string) => createdStores.has(storeName),
        },
        transaction: vi.fn(() => {
          let completionVersion = 0
          let transactionFailed = false

          const transaction = {
            error: null as Error | null,
            objectStore: (storeName: string) => {
              const recordsForStore =
                storeRecords.get(storeName) ?? new Map<string, unknown>()
              storeRecords.set(storeName, recordsForStore)

              const scheduleCompletion = () => {
                const scheduledVersion = ++completionVersion

                setTimeout(() => {
                  if (
                    !transactionFailed &&
                    scheduledVersion === completionVersion
                  ) {
                    transaction.oncomplete?.()
                  }
                }, 0)
              }
              const createRequest = <T>(
                readResult: () => T,
                mutate?: () => void,
                fail = false,
              ) => {
                const request = {
                  error: null as Error | null,
                  result: undefined as T,
                  onerror: null as (() => void) | null,
                  onsuccess: null as (() => void) | null,
                }

                queueMicrotask(() => {
                  if (fail) {
                    transactionFailed = true
                    request.error = new Error('request failed')
                    transaction.error = request.error
                    request.onerror?.()
                    transaction.onerror?.()
                    return
                  }

                  mutate?.()
                  request.result = readResult()
                  request.onsuccess?.()
                  scheduleCompletion()
                })

                return request
              }
              const findIdentityEntry = (key: IDBValidKey) => {
                const identity = Array.isArray(key) ? key : []

                return Array.from(recordsForStore.entries()).find(
                  ([, value]) => {
                    if (!value || typeof value !== 'object') {
                      return false
                    }

                    const record = value as {
                      host?: unknown
                      tenantSlug?: unknown
                      userId?: unknown
                    }

                    return (
                      record.host === identity[0] &&
                      record.tenantSlug === identity[1] &&
                      record.userId === identity[2]
                    )
                  },
                )
              }

              return {
                delete: (key: IDBValidKey) => {
                  deleteCalls.push({ key, storeName })

                  return createRequest(
                    () => undefined,
                    () => {
                      recordsForStore.delete(String(key))
                    },
                  )
                },
                get: (key: IDBValidKey) =>
                  createRequest(() => recordsForStore.get(String(key))),
                getAll: () => {
                  getAllCalls.push(storeName)

                  return createRequest(() =>
                    Array.from(recordsForStore.values()),
                  )
                },
                index: (indexName: string) => ({
                  get: (key: IDBValidKey) => {
                    indexLookups.push({
                      indexName,
                      key,
                      operation: 'get',
                      storeName,
                    })

                    return createRequest(() => findIdentityEntry(key)?.[1])
                  },
                  getKey: (key: IDBValidKey) => {
                    indexLookups.push({
                      indexName,
                      key,
                      operation: 'getKey',
                      storeName,
                    })

                    return createRequest(() => findIdentityEntry(key)?.[0])
                  },
                  openKeyCursor: (keyRange?: IDBKeyRange) => {
                    indexLookups.push({
                      indexName,
                      key: keyRange,
                      operation: 'openKeyCursor',
                      storeName,
                    })

                    const entries = Array.from(recordsForStore.entries())
                      .filter(([, value]) => {
                        const expiresAt =
                          value &&
                          typeof value === 'object' &&
                          typeof (value as { expiresAt?: unknown }).expiresAt ===
                            'string'
                            ? (value as { expiresAt: string }).expiresAt
                            : null

                        return (
                          expiresAt !== null &&
                          (!keyRange || keyRange.includes(expiresAt))
                        )
                      })
                      .sort((left, right) => {
                        const leftExpiry = (
                          left[1] as { expiresAt: string }
                        ).expiresAt
                        const rightExpiry = (
                          right[1] as { expiresAt: string }
                        ).expiresAt

                        return leftExpiry.localeCompare(rightExpiry)
                      })
                    let entryIndex = 0
                    const request = {
                      error: null as Error | null,
                      result: undefined as
                        | {
                            continue: () => void
                            key: IDBValidKey
                            primaryKey: IDBValidKey
                            request: unknown
                          }
                        | undefined,
                      onerror: null as (() => void) | null,
                      onsuccess: null as (() => void) | null,
                    }
                    const emitCursor = () => {
                      const entry = entries[entryIndex]

                      request.result = entry
                        ? {
                            continue: () => {
                              entryIndex += 1
                              queueMicrotask(emitCursor)
                            },
                            key: (
                              entry[1] as { expiresAt: IDBValidKey }
                            ).expiresAt,
                            primaryKey: entry[0],
                            request,
                          }
                        : undefined
                      request.onsuccess?.()
                      scheduleCompletion()
                    }

                    queueMicrotask(emitCursor)

                    return request
                  },
                }),
                openCursor: () => {
                  primaryCursorCalls.push(storeName)
                  throw new Error('Primary-store cursor is not supported.')
                },
                put: (value: unknown, key?: IDBValidKey) => {
                  const resolvedKey =
                    key ??
                    (value &&
                    typeof value === 'object' &&
                    typeof (value as { draftId?: unknown }).draftId ===
                      'string'
                      ? (value as { draftId: string }).draftId
                      : undefined)

                  putCalls.push({ key, storeName, value })

                  return createRequest(
                    () => resolvedKey,
                    () => {
                      if (resolvedKey !== undefined) {
                        recordsForStore.set(String(resolvedKey), value)
                      }
                    },
                    failPut,
                  )
                },
              }
            },
            onabort: null as (() => void) | null,
            oncomplete: null as (() => void) | null,
            onerror: null as (() => void) | null,
          }

          return transaction
        }),
      }
      const request = {
        error: null as Error | null,
        result: database,
        onerror: null as (() => void) | null,
        onsuccess: null as (() => void) | null,
        onupgradeneeded: null as (() => void) | null,
      }

      queueMicrotask(() => {
        if (failOpen) {
          request.error = new Error('open failed')
          request.onerror?.()
          return
        }

        request.onupgradeneeded?.()
        request.onsuccess?.()
      })

      return request
    }),
  }

  return {
    createdIndexes,
    createdStoreOptions,
    createdStores,
    deleteCalls,
    getAllCalls,
    indexLookups,
    indexedDB,
    primaryCursorCalls,
    putCalls,
    storeRecords,
  }
}
