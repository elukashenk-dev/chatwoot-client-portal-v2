import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getUserNotificationSettings,
  updateUserNotificationSettings,
} from '../../chat/api/chatClient'
import {
  disableBrowserPushOnDevice,
  ensureBrowserPushSubscription,
  loadBrowserPushSnapshot,
} from '../../chat/pages/notificationBrowserPush'
import { UserNotificationsPage } from './UserNotificationsPage'

vi.mock('../../chat/api/chatClient', async () => {
  const actual = await vi.importActual<
    typeof import('../../chat/api/chatClient')
  >('../../chat/api/chatClient')

  return {
    ...actual,
    getUserNotificationSettings: vi.fn(),
    updateUserNotificationSettings: vi.fn(),
  }
})

vi.mock('../../chat/pages/notificationBrowserPush', async () => {
  const actual = await vi.importActual<
    typeof import('../../chat/pages/notificationBrowserPush')
  >('../../chat/pages/notificationBrowserPush')

  return {
    ...actual,
    disableBrowserPushOnDevice: vi.fn(),
    ensureBrowserPushSubscription: vi.fn(),
    loadBrowserPushSnapshot: vi.fn(),
  }
})

const getUserNotificationSettingsMock = vi.mocked(getUserNotificationSettings)
const updateUserNotificationSettingsMock = vi.mocked(
  updateUserNotificationSettings,
)
const loadBrowserPushSnapshotMock = vi.mocked(loadBrowserPushSnapshot)
const ensureBrowserPushSubscriptionMock = vi.mocked(
  ensureBrowserPushSubscription,
)
const disableBrowserPushOnDeviceMock = vi.mocked(disableBrowserPushOnDevice)

const browserPushSnapshot = {
  configured: true,
  permission: 'granted',
  publicKey: {
    available: true,
    publicKey: 'public-key',
    publicKeyFingerprint: 'sha256-public-key',
    vapidKeyId: 'sha256-public',
  },
  subscribed: false,
  subscriptionEndpoint: null,
  support: {
    reason: 'supported',
    supported: true,
  },
} as const

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/app/settings/notifications']}>
      <UserNotificationsPage />
    </MemoryRouter>,
  )
}

describe('UserNotificationsPage', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('loads global notification settings and toggles sound', async () => {
    const user = userEvent.setup()

    getUserNotificationSettingsMock.mockResolvedValueOnce({
      newMessagesEnabled: true,
      pushEnabled: false,
      soundEnabled: true,
    })
    loadBrowserPushSnapshotMock.mockResolvedValueOnce(browserPushSnapshot)
    updateUserNotificationSettingsMock.mockResolvedValueOnce({
      newMessagesEnabled: true,
      pushEnabled: false,
      soundEnabled: false,
    })

    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Уведомления' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: /Звук/ }))

    await waitFor(() => {
      expect(updateUserNotificationSettingsMock).toHaveBeenCalledWith({
        soundEnabled: false,
      })
    })
  })

  it('subscribes before enabling global push default', async () => {
    const user = userEvent.setup()

    getUserNotificationSettingsMock.mockResolvedValueOnce({
      newMessagesEnabled: true,
      pushEnabled: false,
      soundEnabled: true,
    })
    loadBrowserPushSnapshotMock.mockResolvedValueOnce(browserPushSnapshot)
    ensureBrowserPushSubscriptionMock.mockResolvedValueOnce({
      browserPush: {
        ...browserPushSnapshot,
        subscribed: true,
        subscriptionEndpoint: 'https://push.example.test/subscription',
      },
      result: 'subscribed',
    })
    updateUserNotificationSettingsMock.mockResolvedValueOnce({
      newMessagesEnabled: true,
      pushEnabled: true,
      soundEnabled: true,
    })

    renderPage()

    await screen.findByRole('switch', { name: /Push-уведомления/ })
    await user.click(screen.getByRole('switch', { name: /Push-уведомления/ }))

    await waitFor(() => {
      expect(ensureBrowserPushSubscriptionMock).toHaveBeenCalled()
      expect(updateUserNotificationSettingsMock).toHaveBeenCalledWith({
        pushEnabled: true,
      })
    })
  })

  it('disconnects push on this device without changing global push default', async () => {
    const user = userEvent.setup()
    const subscribedBrowserPush = {
      ...browserPushSnapshot,
      subscribed: true,
      subscriptionEndpoint: 'https://push.example.test/subscription',
    }

    getUserNotificationSettingsMock.mockResolvedValueOnce({
      newMessagesEnabled: true,
      pushEnabled: true,
      soundEnabled: true,
    })
    loadBrowserPushSnapshotMock.mockResolvedValueOnce(subscribedBrowserPush)
    disableBrowserPushOnDeviceMock.mockResolvedValueOnce({
      ...subscribedBrowserPush,
      subscribed: false,
      subscriptionEndpoint: null,
    })

    renderPage()

    await user.click(
      await screen.findByRole('button', {
        name: 'Отключить push на этом устройстве',
      }),
    )

    await waitFor(() => {
      expect(disableBrowserPushOnDeviceMock).toHaveBeenCalled()
    })
    expect(updateUserNotificationSettingsMock).not.toHaveBeenCalled()
  })
})
