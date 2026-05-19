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

    expect(container.firstElementChild).toHaveClass('absolute')
    expect(container.firstElementChild).not.toHaveClass('fixed')
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
