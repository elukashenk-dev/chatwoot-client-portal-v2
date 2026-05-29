import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { StartupScreenGate } from './StartupScreenGate'

describe('StartupScreenGate', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not show the startup screen when work finishes before the delay', async () => {
    vi.useFakeTimers()

    const { rerender } = render(
      <StartupScreenGate
        active
        fallback={{
          statusLabel: 'Проверяем доступ',
          title: 'Открываем кабинет',
        }}
      >
        <div>Готовый экран</div>
      </StartupScreenGate>,
    )

    expect(
      screen.queryByRole('heading', { name: 'Открываем кабинет' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Готовый экран')).not.toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(449)
    })

    rerender(
      <StartupScreenGate
        active={false}
        fallback={{
          statusLabel: 'Проверяем доступ',
          title: 'Открываем кабинет',
        }}
      >
        <div>Готовый экран</div>
      </StartupScreenGate>,
    )

    expect(screen.getByText('Готовый экран')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Открываем кабинет' }),
    ).not.toBeInTheDocument()
  })

  it('keeps the startup screen visible for a stable minimum duration', async () => {
    vi.useFakeTimers()

    const { rerender } = render(
      <StartupScreenGate
        active
        fallback={{
          statusLabel: 'Проверяем доступ',
          title: 'Открываем кабинет',
        }}
      >
        <div>Готовый экран</div>
      </StartupScreenGate>,
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(450)
    })

    expect(
      screen.getByRole('heading', { name: 'Открываем кабинет' }),
    ).toBeInTheDocument()

    rerender(
      <StartupScreenGate
        active={false}
        fallback={{
          statusLabel: 'Проверяем доступ',
          title: 'Открываем кабинет',
        }}
      >
        <div>Готовый экран</div>
      </StartupScreenGate>,
    )

    expect(
      screen.getByRole('heading', { name: 'Открываем кабинет' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Готовый экран')).not.toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(699)
    })

    expect(
      screen.getByRole('heading', { name: 'Открываем кабинет' }),
    ).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(screen.getByText('Готовый экран')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Открываем кабинет' }),
    ).not.toBeInTheDocument()
  })
})
