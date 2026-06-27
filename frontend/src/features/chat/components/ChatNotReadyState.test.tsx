import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ChatNotReadyState } from './ChatNotReadyState'

describe('ChatNotReadyState', () => {
  it('uses neutral support-service copy for unavailable support runtime', () => {
    render(
      <ChatNotReadyState
        isUnavailable
        onRetry={vi.fn()}
        reason="chatwoot_unavailable"
      />,
    )

    expect(
      screen.getByText(
        'Мы не смогли получить состояние переписки из сервиса поддержки. Попробуйте обновить чат немного позже.',
      ),
    ).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/chatwoot/i)
  })

  it('uses neutral support-profile copy for missing contact link', () => {
    render(
      <ChatNotReadyState
        isUnavailable={false}
        onRetry={vi.fn()}
        reason="contact_link_missing"
      />,
    )

    expect(
      screen.getByText(
        'Аккаунт авторизован, но профиль поддержки еще не связан с этим пользователем.',
      ),
    ).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/chatwoot/i)
  })
})
