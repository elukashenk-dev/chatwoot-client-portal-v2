import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ChatLoadingState } from './ChatLoadingState'
import {
  StartupSurfaceOverlay,
  StartupSurfaceProvider,
} from '../../tenant/startup/StartupSurfaceProvider'
import { TenantIdentityContext } from '../../tenant/lib/tenantIdentityContext'

const tenantContextValue = {
  errorMessage: null,
  isUsingCachedData: false,
  status: 'ready' as const,
  tenant: {
    displayName: 'ProvGroup',
    primaryDomain: 'lk.provgroup.ru',
    publicBaseUrl: 'https://lk.provgroup.ru',
    slug: 'provgroup',
  },
}

describe('ChatLoadingState', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports chat startup to the unified surface without rendering an inline splash', async () => {
    vi.useFakeTimers()

    const { container } = render(
      <TenantIdentityContext.Provider value={tenantContextValue}>
        <StartupSurfaceProvider>
          <ChatLoadingState userName="Иван Петров" />
          <StartupSurfaceOverlay />
        </StartupSurfaceProvider>
      </TenantIdentityContext.Provider>,
    )

    expect(container.querySelector('main.app-viewport-shell')).toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(450)
    })

    expect(
      screen.getByRole('heading', { name: 'Открываем кабинет' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Готовим чат')).toBeInTheDocument()
    expect(screen.getAllByRole('heading')).toHaveLength(1)
    expect(
      screen
        .getByRole('heading', { name: 'Открываем кабинет' })
        .closest('.fixed'),
    ).toHaveClass('inset-0')
  })
})
