import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ChatFullScreenPanel } from './ChatFullScreenPanel'

describe('ChatFullScreenPanel', () => {
  it('renders title, back button, and children', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()

    const { container } = render(
      <ChatFullScreenPanel
        isLoading={false}
        onBack={onBack}
        onRetry={vi.fn()}
        title="Информация о чате"
      >
        <p>Содержимое страницы</p>
      </ChatFullScreenPanel>,
    )

    expect(
      screen.getByRole('heading', { name: 'Информация о чате' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Содержимое страницы')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Вернуться к чату' }))
    expect(onBack).toHaveBeenCalledTimes(1)

    const header = container.querySelector('header')
    const floatingHeader = header?.querySelector(
      '.chat-floating-header-surface',
    )

    expect(header).toHaveClass('app-safe-top')
    expect(header).not.toHaveClass('chat-header-background')
    expect(header).not.toHaveClass('chat-header-border')
    expect(floatingHeader).toBeInstanceOf(HTMLElement)
    expect(floatingHeader).toHaveClass('py-[9px]')
    expect(
      screen.getByRole('button', { name: 'Вернуться к чату' }),
    ).toHaveClass('chat-header-icon-button')
    expect(container.firstElementChild).toHaveClass('absolute')
    expect(container.firstElementChild).not.toHaveClass('fixed')
  })

  it('renders a non-focusable back affordance in read-only mode', () => {
    const onBack = vi.fn()

    const { container } = render(
      <ChatFullScreenPanel
        isBackActionReadOnly
        isLoading={false}
        onBack={onBack}
        onRetry={vi.fn()}
        title="Информация о чате"
      >
        <p>Содержимое страницы</p>
      </ChatFullScreenPanel>,
    )
    const readOnlyBackAffordance = container.querySelector(
      '[data-chat-read-only-back-affordance]',
    )

    expect(screen.queryByLabelText('Вернуться к чату')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Вернуться к чату' }),
    ).not.toBeInTheDocument()
    expect(readOnlyBackAffordance).toBeInstanceOf(HTMLElement)
    expect(readOnlyBackAffordance?.tagName).toBe('SPAN')
    expect(readOnlyBackAffordance).toHaveClass('chat-header-icon-button')
    expect(readOnlyBackAffordance).not.toHaveAttribute('tabindex')
    expect(readOnlyBackAffordance).not.toHaveAttribute('role')
    expect(onBack).not.toHaveBeenCalled()
  })

  it('renders loading and unavailable states', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()

    const { rerender } = render(
      <ChatFullScreenPanel
        isLoading
        onBack={vi.fn()}
        onRetry={onRetry}
        title="Медиа и файлы"
      >
        <p>Не видно при загрузке</p>
      </ChatFullScreenPanel>,
    )

    expect(screen.getByText('Загружаем данные.')).toBeInTheDocument()
    expect(screen.queryByText('Не видно при загрузке')).not.toBeInTheDocument()

    rerender(
      <ChatFullScreenPanel
        isLoading={false}
        isUnavailable
        onBack={vi.fn()}
        onRetry={onRetry}
        title="Медиа и файлы"
        unavailableMessage="Не удалось загрузить медиа."
      >
        <p>Не видно при ошибке</p>
      </ChatFullScreenPanel>,
    )

    expect(screen.getByText('Не удалось загрузить медиа.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
