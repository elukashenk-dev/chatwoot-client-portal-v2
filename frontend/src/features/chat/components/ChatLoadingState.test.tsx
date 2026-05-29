import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ChatLoadingState } from './ChatLoadingState'

describe('ChatLoadingState', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the delayed startup screen inline inside the chat shell', async () => {
    vi.useFakeTimers()

    const { container } = render(<ChatLoadingState userName="Portal User" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(450)
    })

    expect(
      screen.getByRole('heading', { name: 'Открываем кабинет' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Готовим чат')).toBeInTheDocument()
    expect(container.querySelector('main.app-viewport-shell')).toBeNull()
  })
})
