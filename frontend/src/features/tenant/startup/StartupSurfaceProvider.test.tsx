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
  brandMonogram,
  brandName,
  phase,
  statusLabel,
}: {
  active: boolean
  brandMonogram?: string
  brandName?: string
  phase: StartupSurfacePhase
  statusLabel: string
}) {
  useStartupSurfaceReport({
    active,
    brandMonogram,
    brandName,
    description: `${statusLabel} description`,
    phase,
    statusLabel,
    title: 'Открываем кабинет',
  })

  return <div>reporter {phase}</div>
}

function Harness({
  active,
  brandMonogram,
  brandName,
  phase = 'tenant',
  statusLabel = 'Загружаем настройки',
}: {
  active: boolean
  brandMonogram?: string
  brandName?: string
  phase?: StartupSurfacePhase
  statusLabel?: string
}) {
  return (
    <StartupSurfaceProvider>
      <Reporter
        active={active}
        brandMonogram={brandMonogram}
        brandName={brandName}
        phase={phase}
        statusLabel={statusLabel}
      />
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

  it('uses brand fields reported from tenant-aware phases', async () => {
    vi.useFakeTimers()
    render(<Harness active brandMonogram="PG" brandName="PROVGROUP" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STARTUP_SURFACE_SHOW_DELAY_MS)
    })

    expect(screen.getByText('PROVGROUP')).toBeInTheDocument()
    expect(screen.getByText('PG')).toBeInTheDocument()
  })

  it('keeps the pre-root splash until the startup overlay is ready', async () => {
    vi.useFakeTimers()
    const preRootSplash = document.createElement('div')
    preRootSplash.id = 'portal-pre-root-startup'
    preRootSplash.textContent = 'pre-root splash'
    document.body.append(preRootSplash)

    render(<Harness active />)

    expect(document.getElementById('portal-pre-root-startup')).not.toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STARTUP_SURFACE_SHOW_DELAY_MS - 1)
    })

    expect(document.getElementById('portal-pre-root-startup')).not.toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(document.getElementById('portal-pre-root-startup')).toBeNull()
    expect(
      screen.getByRole('heading', { name: 'Открываем кабинет' }),
    ).toBeInTheDocument()
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
