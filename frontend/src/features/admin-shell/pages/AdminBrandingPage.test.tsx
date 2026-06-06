import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderWithRouter } from '../../../test/renderWithRouter'
import {
  AdminSessionContext,
  type AdminSessionContextValue,
} from '../../admin-auth/lib/adminSessionContext'
import { AdminBrandingPage } from './AdminBrandingPage'

function renderAdminBrandingPage(
  overrides: Partial<AdminSessionContextValue> = {},
) {
  const adminSession = {
    admin: {
      chatwootAgentId: 11,
      email: 'admin@example.test',
      role: 'administrator',
    },
    errorMessage: null,
    refreshSession: vi.fn(),
    setVerifiedSession: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
    status: 'authenticated',
    ...overrides,
  } satisfies AdminSessionContextValue

  renderWithRouter(
    <AdminSessionContext.Provider value={adminSession}>
      <AdminBrandingPage />
    </AdminSessionContext.Provider>,
    { initialEntries: ['/admin/branding'] },
  )

  return adminSession
}

describe('AdminBrandingPage', () => {
  it('renders read-only branding console groups and preview shell', () => {
    renderAdminBrandingPage()

    expect(
      screen.getByRole('heading', { name: 'Брендинг' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Основное' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Цвета' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Фоны и изображения' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Фоны и изображения' }),
    ).toHaveAttribute('href', '#backgrounds')
    expect(
      screen
        .getByRole('heading', { name: 'Фоны и изображения' })
        .closest('section'),
    ).toHaveAttribute('id', 'backgrounds')
    expect(screen.getByRole('heading', { name: 'Тексты' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Чат' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Страницы портала' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('только просмотр')).toHaveLength(6)
    expect(screen.getByText('Предпросмотр')).toBeInTheDocument()
    expect(
      screen.getByText('Админ-консоль доступна с широкого экрана'),
    ).toBeInTheDocument()
  })

  it('keeps future branding controls disabled', () => {
    renderAdminBrandingPage()

    for (const controlName of [
      'Название портала',
      'Загрузить логотип',
      'Основной цвет',
      'Фон auth-экранов',
      'Фон чата',
      'Label поддержки',
      'Страница информации о чате',
    ]) {
      expect(screen.getByRole('button', { name: controlName })).toBeDisabled()
    }
  })

  it('calls admin sign out from the shell', async () => {
    const user = userEvent.setup()
    const adminSession = renderAdminBrandingPage()

    await user.click(screen.getAllByRole('button', { name: 'Выйти' })[0])

    expect(adminSession.signOut).toHaveBeenCalledTimes(1)
  })

  it('shows logout errors without leaving the page', async () => {
    const user = userEvent.setup()

    renderAdminBrandingPage({
      signOut: vi.fn().mockRejectedValue(new Error('Не удалось выйти.')),
    })

    await user.click(screen.getAllByRole('button', { name: 'Выйти' })[0])

    const alerts = await screen.findAllByRole('alert')
    expect(alerts[0]).toHaveTextContent('Не удалось выйти.')
    expect(alerts[1]).toHaveTextContent('Не удалось выйти.')
    expect(
      screen.getByRole('heading', { name: 'Брендинг' }),
    ).toBeInTheDocument()
    for (const logoutButton of screen.getAllByRole('button', {
      name: 'Выйти',
    })) {
      expect(logoutButton).toBeEnabled()
    }
  })
})
