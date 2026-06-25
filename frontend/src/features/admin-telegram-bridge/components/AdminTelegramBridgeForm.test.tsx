import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AdminApiClientError } from '../../admin-auth/api/adminAuthClient'
import { AdminTelegramBridgeForm } from './AdminTelegramBridgeForm'

const { setupTelegramBridgeMock } = vi.hoisted(() => ({
  setupTelegramBridgeMock: vi.fn(),
}))

vi.mock('../api/adminTelegramBridgeClient', () => ({
  setupTelegramBridge: setupTelegramBridgeMock,
}))

const successResponse = {
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
}

describe('AdminTelegramBridgeForm', () => {
  beforeEach(() => {
    setupTelegramBridgeMock.mockReset()
    setupTelegramBridgeMock.mockResolvedValue(successResponse)
  })

  it('renders setup fields and keeps submit disabled until both fields are filled', async () => {
    const user = userEvent.setup()

    render(<AdminTelegramBridgeForm />)

    const inboxUrlInput = screen.getByLabelText('Chatwoot inbox URL')
    const botTokenInput = screen.getByLabelText('Telegram bot token')
    const submitButton = screen.getByRole('button', {
      name: 'Создать Telegram bridge',
    })

    expect(inboxUrlInput).toBeInTheDocument()
    expect(botTokenInput).toHaveAttribute('type', 'password')
    expect(submitButton).toBeDisabled()

    await user.type(
      inboxUrlInput,
      'https://app.lancora.ru/app/accounts/1/settings/inboxes/17',
    )
    expect(submitButton).toBeDisabled()

    await user.type(botTokenInput, '1234567890:AASecretBotTokenValue')
    expect(submitButton).toBeEnabled()
  })

  it('submits both fields to the setup client and clears the token after success', async () => {
    const user = userEvent.setup()

    render(<AdminTelegramBridgeForm />)

    await user.type(
      screen.getByLabelText('Chatwoot inbox URL'),
      'https://app.lancora.ru/app/accounts/1/settings/inboxes/17',
    )
    await user.type(
      screen.getByLabelText('Telegram bot token'),
      '1234567890:AASecretBotTokenValue',
    )
    await user.click(
      screen.getByRole('button', { name: 'Создать Telegram bridge' }),
    )

    await waitFor(() => {
      expect(setupTelegramBridgeMock).toHaveBeenCalledWith({
        chatwootInboxUrl:
          'https://app.lancora.ru/app/accounts/1/settings/inboxes/17',
        telegramBotToken: '1234567890:AASecretBotTokenValue',
      })
    })
    expect(
      await screen.findByText('Telegram bridge работает'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Telegram bot token')).toHaveValue('')
    expect(screen.queryByText('1234567890:AASecretBotTokenValue')).not.toBeInTheDocument()
  })

  it('clears the token after a handled API error without echoing the token', async () => {
    const user = userEvent.setup()
    const secret = '1234567890:AASecretBotTokenValue'

    setupTelegramBridgeMock.mockRejectedValue(
      new AdminApiClientError({
        message: 'Проверьте ссылку на источник и токен Telegram бота.',
        statusCode: 400,
      }),
    )

    render(<AdminTelegramBridgeForm />)

    await user.type(
      screen.getByLabelText('Chatwoot inbox URL'),
      'https://app.lancora.ru/app/accounts/1/settings/inboxes/17',
    )
    await user.type(screen.getByLabelText('Telegram bot token'), secret)
    await user.click(
      screen.getByRole('button', { name: 'Создать Telegram bridge' }),
    )

    expect(
      await screen.findByText(
        'Проверьте ссылку на источник и токен Telegram бота.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Telegram bot token')).toHaveValue('')
    expect(document.body).not.toHaveTextContent(secret)
  })
})
