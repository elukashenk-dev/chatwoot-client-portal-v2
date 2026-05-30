import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AppStartupScreen } from './AppStartupScreen'
import { TenantIdentityContext } from '../lib/tenantIdentityContext'

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

describe('AppStartupScreen', () => {
  it('renders a stable default startup surface before tenant branding is ready', () => {
    render(
      <AppStartupScreen
        statusLabel="Проверяем доступ"
        title="Открываем кабинет"
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Открываем кабинет' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Клиентский портал')).toBeInTheDocument()
    expect(screen.getByText('ЛК')).toBeInTheDocument()
    expect(screen.getByText('Готовим личный кабинет.')).toBeInTheDocument()
    expect(screen.getByText('Проверяем доступ')).toBeInTheDocument()
  })

  it('keeps the same surface when tenant branding becomes available', () => {
    render(
      <TenantIdentityContext.Provider value={tenantContextValue}>
        <AppStartupScreen statusLabel="Готовим чат" userName="Иван Петров" />
      </TenantIdentityContext.Provider>,
    )

    expect(
      screen.getByRole('heading', { name: 'Открываем кабинет' }),
    ).toBeInTheDocument()
    expect(screen.getByText('ProvGroup')).toBeInTheDocument()
    expect(screen.getByText('PR')).toBeInTheDocument()
    expect(
      screen.getByText('Готовим личный кабинет ProvGroup.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Готовим чат')).toBeInTheDocument()
  })

  it('can show the chat loading skeleton without changing the startup layout', () => {
    const { container } = render(<AppStartupScreen showChatPreview />)

    expect(container.querySelectorAll('.app-skeleton')).toHaveLength(4)
    expect(
      screen.getByRole('heading', { name: 'Открываем кабинет' }),
    ).toBeInTheDocument()
  })

  it('uses report-owned brand fields when rendered outside tenant context', () => {
    render(
      <AppStartupScreen
        brandMonogram="PG"
        brandName="PROVGROUP"
        statusLabel="Готовим чат"
      />,
    )

    expect(screen.getByText('PROVGROUP')).toBeInTheDocument()
    expect(screen.getByText('PG')).toBeInTheDocument()
  })
})
