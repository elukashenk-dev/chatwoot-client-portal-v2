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
      pushEnabled: false,
      soundEnabled: true,
    },
    global: {
      newMessagesEnabled: true,
      pushEnabled: false,
      soundEnabled: true,
    },
    overrides: {
      newMessagesEnabled: null,
      pushEnabled: null,
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
      pushEnabled?: boolean | null
      soundEnabled?: boolean | null
    }) => void
  }> = {},
) {
  const onResetThreadOverrides = callbacks.onResetThreadOverrides ?? vi.fn()
  const onEnablePushForThread = vi.fn()
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
      onDisableDevicePush={vi.fn()}
      onEnablePushForThread={onEnablePushForThread}
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
    onEnablePushForThread,
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
      screen.getByRole('switch', { name: /Новые сообщения/ }),
    ).toHaveAttribute('aria-checked', 'true')
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

  it('shows reset action only when a chat override exists', async () => {
    const user = userEvent.setup()
    const onResetThreadOverrides = vi.fn()

    renderPage(
      {
        settings: {
          ...readyState.settings,
          overrides: {
            newMessagesEnabled: null,
            pushEnabled: null,
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

  it('offers to connect this device when chat push is enabled elsewhere', async () => {
    const user = userEvent.setup()
    const { onEnablePushForThread } = renderPage({
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
          pushEnabled: true,
        },
        global: {
          ...readyState.settings.global,
          pushEnabled: true,
        },
      },
    })

    await user.click(
      screen.getByRole('button', {
        name: 'Подключить push на этом устройстве',
      }),
    )

    expect(onEnablePushForThread).toHaveBeenCalled()
  })
})
