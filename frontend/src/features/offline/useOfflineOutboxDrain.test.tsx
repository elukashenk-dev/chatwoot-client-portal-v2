import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { drainOfflineTextOutbox, withOutboxDrainLock } from './outboxDrain'
import { useOfflineOutboxDrain } from './useOfflineOutboxDrain'

vi.mock('../chat/api/chatClient', () => ({
  sendChatMessage: vi.fn(),
}))

vi.mock('./outboxDrain', () => ({
  drainOfflineTextOutbox: vi.fn(),
  withOutboxDrainLock: vi.fn(
    async (
      _tenantSlug: string,
      _userId: number,
      operation: () => Promise<unknown>,
    ) => operation(),
  ),
}))

const drainOfflineTextOutboxMock = vi.mocked(drainOfflineTextOutbox)
const withOutboxDrainLockMock = vi.mocked(withOutboxDrainLock)

afterEach(() => {
  vi.clearAllMocks()
})

it('drains on mount with the current tenant user scope and success callback', async () => {
  const onAuthRejected = vi.fn()
  const onDrainOutcome = vi.fn()
  const onSendSucceeded = vi.fn()

  drainOfflineTextOutboxMock.mockResolvedValueOnce('drained')

  renderHook(() =>
    useOfflineOutboxDrain({
      enabled: true,
      onAuthRejected,
      onDrainOutcome,
      onSendSucceeded,
      tenantSlug: 'buhfirma',
      userId: 7,
    }),
  )

  await waitFor(() => {
    expect(withOutboxDrainLockMock).toHaveBeenCalledWith(
      'buhfirma',
      7,
      expect.any(Function),
    )
  })
  expect(drainOfflineTextOutboxMock).toHaveBeenCalledWith(
    expect.objectContaining({
      onDrainOutcome,
      onSendSucceeded,
      tenantSlug: 'buhfirma',
      userId: 7,
    }),
  )
  expect(onAuthRejected).not.toHaveBeenCalled()
})

it('invokes the auth rejection callback when drain returns auth_rejected', async () => {
  const onAuthRejected = vi.fn()

  drainOfflineTextOutboxMock.mockResolvedValueOnce('auth_rejected')

  renderHook(() =>
    useOfflineOutboxDrain({
      enabled: true,
      onAuthRejected,
      onSendSucceeded: vi.fn(),
      tenantSlug: 'buhfirma',
      userId: 7,
    }),
  )

  await waitFor(() => {
    expect(onAuthRejected).toHaveBeenCalledTimes(1)
  })
})

it('does not drain without a valid scope', async () => {
  renderHook(() =>
    useOfflineOutboxDrain({
      enabled: true,
      onAuthRejected: vi.fn(),
      onSendSucceeded: vi.fn(),
      tenantSlug: null,
      userId: 7,
    }),
  )

  expect(withOutboxDrainLockMock).not.toHaveBeenCalled()
  expect(drainOfflineTextOutboxMock).not.toHaveBeenCalled()
})

it('drains again when the browser comes online', async () => {
  drainOfflineTextOutboxMock.mockResolvedValue('drained')

  renderHook(() =>
    useOfflineOutboxDrain({
      enabled: true,
      onAuthRejected: vi.fn(),
      onSendSucceeded: vi.fn(),
      tenantSlug: 'buhfirma',
      userId: 7,
    }),
  )

  await waitFor(() => {
    expect(withOutboxDrainLockMock).toHaveBeenCalledTimes(1)
  })

  window.dispatchEvent(new Event('online'))

  await waitFor(() => {
    expect(withOutboxDrainLockMock).toHaveBeenCalledTimes(2)
  })
})

it('drains again when the visible tab returns to foreground', async () => {
  drainOfflineTextOutboxMock.mockResolvedValue('drained')

  renderHook(() =>
    useOfflineOutboxDrain({
      enabled: true,
      onAuthRejected: vi.fn(),
      onSendSucceeded: vi.fn(),
      tenantSlug: 'buhfirma',
      userId: 7,
    }),
  )

  await waitFor(() => {
    expect(withOutboxDrainLockMock).toHaveBeenCalledTimes(1)
  })

  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  })
  document.dispatchEvent(new Event('visibilitychange'))

  await waitFor(() => {
    expect(withOutboxDrainLockMock).toHaveBeenCalledTimes(2)
  })
})

it('does not treat user id zero as a missing scope', async () => {
  drainOfflineTextOutboxMock.mockResolvedValueOnce('drained')

  renderHook(() =>
    useOfflineOutboxDrain({
      enabled: true,
      onAuthRejected: vi.fn(),
      onSendSucceeded: vi.fn(),
      tenantSlug: 'buhfirma',
      userId: 0,
    }),
  )

  await waitFor(() => {
    expect(withOutboxDrainLockMock).toHaveBeenCalledWith(
      'buhfirma',
      0,
      expect.any(Function),
    )
  })
})

it('drains again through the lock when the request signal changes', async () => {
  const onAuthRejected = vi.fn()
  const onDrainOutcome = vi.fn()
  const onSendSucceeded = vi.fn()

  drainOfflineTextOutboxMock.mockResolvedValue('drained')

  const { rerender } = renderHook(
    ({ drainRequestSignal }) =>
      useOfflineOutboxDrain({
        drainRequestSignal,
        enabled: true,
        onAuthRejected,
        onDrainOutcome,
        onSendSucceeded,
        tenantSlug: 'buhfirma',
        userId: 7,
      }),
    {
      initialProps: {
        drainRequestSignal: 0,
      },
    },
  )

  await waitFor(() => {
    expect(withOutboxDrainLockMock).toHaveBeenCalledTimes(1)
  })

  rerender({ drainRequestSignal: 1 })

  await waitFor(() => {
    expect(withOutboxDrainLockMock).toHaveBeenCalledTimes(2)
  })
  expect(drainOfflineTextOutboxMock).toHaveBeenCalledTimes(2)
  expect(drainOfflineTextOutboxMock).toHaveBeenLastCalledWith(
    expect.objectContaining({
      onDrainOutcome,
      onSendSucceeded,
      tenantSlug: 'buhfirma',
      userId: 7,
    }),
  )
})
