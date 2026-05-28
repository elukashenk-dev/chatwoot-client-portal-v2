import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  estimateOfflineStorage,
  isOfflineStorageQuotaError,
  isOfflineStorageUnavailableError,
  requestOfflineStoragePersistence,
} from './storagePersistence'

const originalStorage = navigator.storage

function setNavigatorStorage(storage: unknown) {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: storage,
  })
}

describe('offline storage persistence', () => {
  afterEach(() => {
    setNavigatorStorage(originalStorage)
  })

  it('requests persistent storage when the browser supports it', async () => {
    const persist = vi.fn(async () => true)

    setNavigatorStorage({
      persist,
    })

    await expect(requestOfflineStoragePersistence()).resolves.toBe(true)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('returns false when persistence is unsupported or rejected', async () => {
    setNavigatorStorage({})

    await expect(requestOfflineStoragePersistence()).resolves.toBe(false)

    setNavigatorStorage({
      persist: vi.fn(async () => {
        throw new Error('denied')
      }),
    })

    await expect(requestOfflineStoragePersistence()).resolves.toBe(false)
  })

  it('detects browser quota errors separately from generic failures', () => {
    expect(
      isOfflineStorageQuotaError(
        new DOMException('Storage is full', 'QuotaExceededError'),
      ),
    ).toBe(true)
    expect(isOfflineStorageQuotaError(new Error('boom'))).toBe(false)
  })

  it('classifies IndexedDB unavailable and version errors as storage failures', () => {
    expect(
      isOfflineStorageUnavailableError(
        new DOMException('Database is blocked', 'InvalidStateError'),
      ),
    ).toBe(true)
    expect(
      isOfflineStorageUnavailableError(
        new DOMException(
          'Old service worker opened a newer DB',
          'VersionError',
        ),
      ),
    ).toBe(true)
    expect(isOfflineStorageUnavailableError(new Error('boom'))).toBe(false)
  })

  it('reports low quota from storage estimate', async () => {
    setNavigatorStorage({
      estimate: vi.fn(async () => ({
        quota: 100,
        usage: 95,
      })),
    })

    await expect(estimateOfflineStorage()).resolves.toEqual({
      isLowQuota: true,
      quota: 100,
      usage: 95,
      usageRatio: 0.95,
    })
  })

  it('returns an empty estimate when storage estimate is unavailable', async () => {
    setNavigatorStorage({})

    await expect(estimateOfflineStorage()).resolves.toEqual({
      isLowQuota: false,
      quota: null,
      usage: null,
      usageRatio: null,
    })
  })
})
