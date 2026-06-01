import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { ChatNotificationsPanelState } from '../pages/useChatNotificationsPanel'
import { ChatNotificationsPage } from './ChatNotificationsPage'

const readyState = {
  browserPush: {
    configured: false,
    permission: 'unsupported',
    publicKey: {
      available: false,
    },
    subscribed: false,
    subscriptionEndpoint: null,
    support: {
      reason: 'push_unavailable',
      supported: false,
    },
  },
  errorMessage: null,
  isLoading: false,
  isOpen: true,
  isUpdating: false,
  settings: {
    effective: {
      newMessagesEnabled: true,
      soundEnabled: true,
    },
    global: {
      newMessagesEnabled: true,
      soundEnabled: true,
    },
    overrides: {
      newMessagesEnabled: null,
      soundEnabled: null,
    },
    threadId: 'group:155',
  },
  settingsThreadId: 'group:155',
} satisfies ChatNotificationsPanelState

function renderPage(
  overrides: Partial<ChatNotificationsPanelState> = {},
  callbacks: Partial<{
    onResetThreadOverrides: () => void
    onUpdateSetting: (patch: {
      newMessagesEnabled?: boolean | null
      soundEnabled?: boolean | null
    }) => void
  }> = {},
) {
  const onResetThreadOverrides = callbacks.onResetThreadOverrides ?? vi.fn()
  const onConnectDevicePush = vi.fn()
  const onUpdateSetting = callbacks.onUpdateSetting ?? vi.fn()

  render(
    <ChatNotificationsPage
      activeThread={{
        id: 'group:155',
        subtitle: 'Групповой чат',
        title: 'ИП Петров',
        type: 'group',
      }}
      onBack={vi.fn()}
      onConnectDevicePush={onConnectDevicePush}
      onDisableDevicePush={vi.fn()}
      onResetThreadOverrides={onResetThreadOverrides}
      onRetry={vi.fn()}
      onUpdateSetting={onUpdateSetting}
      state={{
        ...readyState,
        ...overrides,
      }}
    />,
  )

  return {
    onConnectDevicePush,
    onResetThreadOverrides,
    onUpdateSetting,
  }
}

describe('ChatNotificationsPage', () => {
  it('shows current chat identity and inherited notification state', () => {
    renderPage()

    expect(
      screen.getByRole('heading', { name: 'Уведомления' }),
    ).toBeInTheDocument()
    expect(screen.getByText('ИП Петров')).toBeInTheDocument()
    expect(screen.getByText('Групповой чат')).toBeInTheDocument()
    expect(screen.getByText('Используются общие настройки')).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: /Уведомления в этом чате/ }),
    ).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Push на этом устройстве')).toBeInTheDocument()
    expect(
      screen.queryByRole('switch', { name: /Push-уведомления/ }),
    ).not.toBeInTheDocument()
  })

  it('patches only the changed chat setting', async () => {
    const user = userEvent.setup()
    const onUpdateSetting = vi.fn()
    renderPage({}, { onUpdateSetting })

    await user.click(screen.getByRole('switch', { name: /Звук/ }))

    expect(onUpdateSetting).toHaveBeenCalledWith({
      soundEnabled: false,
    })
  })

  it('keeps chat sound disabled when global sound is off', () => {
    renderPage({
      settings: {
        ...readyState.settings,
        effective: {
          newMessagesEnabled: true,
          soundEnabled: false,
        },
        global: {
          newMessagesEnabled: true,
          soundEnabled: false,
        },
        overrides: {
          newMessagesEnabled: null,
          soundEnabled: true,
        },
      },
    })

    const soundSwitch = screen.getByRole('switch', { name: /Звук/ })

    expect(soundSwitch).toHaveAttribute('aria-checked', 'false')
    expect(soundSwitch).toBeDisabled()
    expect(screen.getByText('Отключено в общих настройках')).toBeInTheDocument()
  })

  it('shows reset action only when a chat override exists', async () => {
    const user = userEvent.setup()
    const onResetThreadOverrides = vi.fn()

    renderPage(
      {
        settings: {
          ...readyState.settings,
          overrides: {
            newMessagesEnabled: null,
            soundEnabled: false,
          },
        },
      },
      { onResetThreadOverrides },
    )

    await user.click(
      screen.getByRole('button', { name: 'Сбросить к общим настройкам' }),
    )

    expect(onResetThreadOverrides).toHaveBeenCalled()
  })

  it('offers to connect this device when chat notifications are enabled', async () => {
    const user = userEvent.setup()
    const { onConnectDevicePush } = renderPage({
      browserPush: {
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
      },
      settings: {
        ...readyState.settings,
        effective: {
          ...readyState.settings.effective,
        },
        global: {
          ...readyState.settings.global,
        },
      },
    })

    await user.click(
      screen.getByRole('button', {
        name: 'Подключить',
      }),
    )

    expect(onConnectDevicePush).toHaveBeenCalled()
  })
})
