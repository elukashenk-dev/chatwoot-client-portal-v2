import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  StartupSurfaceOverlay,
  StartupSurfaceProvider,
} from './StartupSurfaceProvider'
import {
  STARTUP_SURFACE_HANDOFF_GRACE_MS,
  STARTUP_SURFACE_MIN_VISIBLE_MS,
  STARTUP_SURFACE_SHOW_DELAY_MS,
  type StartupSurfacePhase,
  useStartupSurfaceReport,
} from './startupSurfaceContext'

function Reporter({
  active,
  phase,
  statusLabel,
}: {
  active: boolean
  phase: StartupSurfacePhase
  statusLabel: string
}) {
  useStartupSurfaceReport({
    active,
    description: `${statusLabel} description`,
    phase,
    statusLabel,
    title: 'Открываем кабинет',
  })

  return <div>reporter {phase}</div>
}

function Harness({
  active,
  phase = 'tenant',
  statusLabel = 'Загружаем настройки',
}: {
  active: boolean
  phase?: StartupSurfacePhase
  statusLabel?: string
}) {
  return (
    <StartupSurfaceProvider>
      <Reporter active={active} phase={phase} statusLabel={statusLabel} />
      <div>Ready child</div>
      <StartupSurfaceOverlay />
    </StartupSurfaceProvider>
  )
}

describe('StartupSurfaceProvider', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not show the surface before the anti-flicker delay', async () => {
    vi.useFakeTimers()
    render(<Harness active />)

    expect(
      screen.queryByRole('heading', { name: 'Открываем кабинет' }),
    ).not.toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STARTUP_SURFACE_SHOW_DELAY_MS - 1)
    })

    expect(
      screen.queryByRole('heading', { name: 'Открываем кабинет' }),
    ).not.toBeInTheDocument()
  })

  it('shows one surface after the delay', async () => {
    vi.useFakeTimers()
    render(<Harness active />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STARTUP_SURFACE_SHOW_DELAY_MS)
    })

    expect(
      screen.getByRole('heading', { name: 'Открываем кабинет' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Загружаем настройки')).toBeInTheDocument()
  })

  it('updates the visible phase in place without duplicating headings', async () => {
    vi.useFakeTimers()
    const { rerender } = render(<Harness active />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STARTUP_SURFACE_SHOW_DELAY_MS)
    })

    rerender(<Harness active phase="session" statusLabel="Проверяем сессию" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(
      screen.getAllByRole('heading', { name: 'Открываем кабинет' }),
    ).toHaveLength(1)
    expect(screen.getByText('Проверяем сессию')).toBeInTheDocument()
    expect(screen.queryByText('Загружаем настройки')).not.toBeInTheDocument()
  })

  it('keeps the surface through a short handoff gap', async () => {
    vi.useFakeTimers()
    const { rerender } = render(<Harness active />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STARTUP_SURFACE_SHOW_DELAY_MS)
    })

    rerender(<Harness active={false} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STARTUP_SURFACE_MIN_VISIBLE_MS)
      await vi.advanceTimersByTimeAsync(STARTUP_SURFACE_HANDOFF_GRACE_MS - 1)
    })

    expect(
      screen.getByRole('heading', { name: 'Открываем кабинет' }),
    ).toBeInTheDocument()

    rerender(<Harness active phase="session" statusLabel="Проверяем сессию" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByText('Проверяем сессию')).toBeInTheDocument()
  })

  it('releases after min visible duration and handoff grace', async () => {
    vi.useFakeTimers()
    const { rerender } = render(<Harness active />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STARTUP_SURFACE_SHOW_DELAY_MS)
    })

    rerender(<Harness active={false} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STARTUP_SURFACE_MIN_VISIBLE_MS)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STARTUP_SURFACE_HANDOFF_GRACE_MS)
    })

    expect(
      screen.queryByRole('heading', { name: 'Открываем кабинет' }),
    ).not.toBeInTheDocument()
  })
})
