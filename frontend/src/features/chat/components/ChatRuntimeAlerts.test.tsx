import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ChatRuntimeAlerts } from './ChatRuntimeAlerts'

describe('ChatRuntimeAlerts', () => {
  it('renders one compact offline notice with queued text count', () => {
    const { container } = render(
      <ChatRuntimeAlerts
        connectionStatus="offline"
        isChatAvailable
        isRealtimeSupported
        queuedSendCount={1}
        resyncStatus="idle"
      />,
    )

    expect(
      screen.getByText(
        'Нет связи. 1 сообщение в очереди. Отправим, когда связь восстановится.',
      ),
    ).toBeInTheDocument()
    const notice = screen.getByRole('status')

    expect(notice).toHaveAttribute('data-chat-runtime-notice')
    expect(notice).toHaveClass(
      'chat-runtime-notice',
      'chat-glass-card-surface',
    )
    expect(notice).not.toHaveClass(
      'auth-form-message',
      'auth-form-message--warning',
    )
    expect(
      screen.queryByText(/Показываем сохраненные данные/),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/Сообщения будут отправлены/),
    ).not.toBeInTheDocument()
    expect(
      container.querySelectorAll('[role="status"], [role="alert"]'),
    ).toHaveLength(1)
  })

  it('renders one offline notice for saved chat data without queued sends', () => {
    const { container } = render(
      <ChatRuntimeAlerts
        connectionStatus="offline"
        isChatAvailable
        isRealtimeSupported
        queuedSendCount={0}
        resyncStatus="idle"
      />,
    )

    expect(
      screen.getByText('Нет связи. Показываем сохраненные сообщения.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveClass(
      'chat-runtime-notice',
      'chat-glass-card-surface',
    )
    expect(
      container.querySelectorAll('[role="status"], [role="alert"]'),
    ).toHaveLength(1)
  })

  it('keeps reconnecting status as a single notice', () => {
    const { container } = render(
      <ChatRuntimeAlerts
        connectionStatus="online"
        isChatAvailable
        isRealtimeSupported
        queuedSendCount={2}
        resyncStatus="resyncing"
      />,
    )

    expect(
      screen.getByText('Связь восстановилась. Обновляем чат...'),
    ).toBeInTheDocument()
    expect(
      container.querySelectorAll('[role="status"], [role="alert"]'),
    ).toHaveLength(1)
  })

  it('renders failed resync as an alert notice', () => {
    const { container } = render(
      <ChatRuntimeAlerts
        connectionStatus="online"
        isChatAvailable
        isRealtimeSupported
        queuedSendCount={0}
        resyncStatus="error"
      />,
    )

    expect(
      screen.getByText(
        'Не удалось обновить чат. Проверьте соединение и попробуйте снова.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveClass(
      'chat-runtime-notice',
      'chat-runtime-notice--error',
    )
    expect(
      container.querySelectorAll('[role="status"], [role="alert"]'),
    ).toHaveLength(1)
  })

  it('does not render saved-chat offline notice while cached boot is connecting', () => {
    const { container } = render(
      <ChatRuntimeAlerts
        connectionStatus="connecting"
        isChatAvailable
        isRealtimeSupported
        queuedSendCount={0}
        resyncStatus="idle"
      />,
    )

    expect(
      screen.queryByText('Нет связи. Показываем сохраненные сообщения.'),
    ).not.toBeInTheDocument()
    expect(
      container.querySelectorAll('[role="status"], [role="alert"]'),
    ).toHaveLength(0)
  })
})
