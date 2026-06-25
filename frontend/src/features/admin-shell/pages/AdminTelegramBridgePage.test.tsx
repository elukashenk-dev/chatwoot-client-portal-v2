import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithRouter } from '../../../test/renderWithRouter'
import {
  AdminSessionContext,
  type AdminSessionContextValue,
} from '../../admin-auth/lib/adminSessionContext'
import { AdminTelegramBridgePage } from './AdminTelegramBridgePage'

const { setupTelegramBridgeMock } = vi.hoisted(() => ({
  setupTelegramBridgeMock: vi.fn(),
}))

vi.mock('../../admin-telegram-bridge/api/adminTelegramBridgeClient', () => ({
  setupTelegramBridge: setupTelegramBridgeMock,
}))

function renderAdminTelegramBridgePage(
  overrides: Partial<AdminSessionContextValue> = {},
) {
  const adminSession = {
    admin: {
      chatwootAgentId: 11,
      email: 'admin@example.test',
      role: 'administrator',
    },
    errorMessage: null,
    refreshSession: vi.fn(),
    setVerifiedSession: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
    status: 'authenticated',
    ...overrides,
  } satisfies AdminSessionContextValue

  renderWithRouter(
    <AdminSessionContext.Provider value={adminSession}>
      <AdminTelegramBridgePage />
    </AdminSessionContext.Provider>,
    { initialEntries: ['/admin/integrations/telegram-bridge'] },
  )

  return adminSession
}

describe('AdminTelegramBridgePage', () => {
  beforeEach(() => {
    setupTelegramBridgeMock.mockReset()
    setupTelegramBridgeMock.mockResolvedValue({
      bridge: {
        chatwootTelegramInboxId: 17,
        displayName: 'Telegram support_bot',
        lastWebhookCheckedAt: '2026-06-25T10:00:00.000Z',
        lastWebhookHost: 'app.lancora.ru',
        lastWebhookOwner: 'telegram-bridge',
        publicKey: 'provgroup-support',
        status: 'active',
        telegramBotId: '1234567890',
        telegramBotUsername: 'support_bot',
        webhookConfigured: true,
      },
    })
  })

  it('renders the Telegram bridge admin page with a concise setup form', () => {
    renderAdminTelegramBridgePage()

    expect(
      screen.getByRole('heading', { name: 'Telegram bridge' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Chatwoot inbox URL')).toBeInTheDocument()
    expect(screen.getByLabelText('Telegram bot token')).toBeInTheDocument()
  })

  it('uses the admin desktop visual language with account email and logout action', () => {
    renderAdminTelegramBridgePage()

    expect(
      screen.getByRole('region', {
        name: 'Макет админки Telegram bridge',
      }),
    ).toHaveClass('bg-slate-100')
    expect(screen.getByText('admin@example.test')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument()
  })

  it('does not expose the token value after setup submission', async () => {
    const user = userEvent.setup()
    const secret = '1234567890:AASecretBotTokenValue'

    renderAdminTelegramBridgePage()

    await user.type(
      screen.getByLabelText('Chatwoot inbox URL'),
      'https://app.lancora.ru/app/accounts/1/settings/inboxes/17',
    )
    await user.type(screen.getByLabelText('Telegram bot token'), secret)
    await user.click(
      screen.getByRole('button', { name: 'Создать Telegram bridge' }),
    )

    await waitFor(() => {
      expect(setupTelegramBridgeMock).toHaveBeenCalled()
    })
    expect(screen.getByLabelText('Telegram bot token')).toHaveValue('')
    expect(document.body).not.toHaveTextContent(secret)
  })
})
