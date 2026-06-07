import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminBrandingResponse } from '../../admin-branding/api/adminBrandingClient'
import { renderWithRouter } from '../../../test/renderWithRouter'
import {
  AdminSessionContext,
  type AdminSessionContextValue,
} from '../../admin-auth/lib/adminSessionContext'
import { AdminBrandingPage } from './AdminBrandingPage'

const { getAdminBrandingMock, updateAdminBrandingMock } = vi.hoisted(() => ({
  getAdminBrandingMock: vi.fn(),
  updateAdminBrandingMock: vi.fn(),
}))

vi.mock('../../admin-branding/api/adminBrandingClient', () => ({
  getAdminBranding: getAdminBrandingMock,
  updateAdminBranding: updateAdminBrandingMock,
}))

const savedBrandingResponse = {
  branding: {
    assets: {},
    colors: {
      accent: '#4676b4',
      authBackground: '#f3f7fc',
      chatBackground: '#ffffff',
      chatHeaderBackground: '#112540',
      primary: '#112540',
    },
    copy: {
      authSubtitle: 'Введите email и пароль, чтобы продолжить.',
      authTitle: 'Вход в личный кабинет',
      chatEmptyBody: 'Напишите нам, когда будет удобно.',
      chatEmptyTitle: 'Мы на связи',
      chatInfoTitle: 'Информация о чате',
    },
    portalName: 'Бухфирма',
    supportLabel: 'Команда Бухфирма',
    version: 1,
  },
} satisfies AdminBrandingResponse

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
  beforeEach(() => {
    getAdminBrandingMock.mockResolvedValue(savedBrandingResponse)
    updateAdminBrandingMock.mockResolvedValue(savedBrandingResponse)
  })

  it('loads and renders saved branding settings', async () => {
    renderAdminBrandingPage()

    expect(
      screen.getByText('Загружаем настройки брендинга'),
    ).toBeInTheDocument()

    expect(await screen.findByDisplayValue('Бухфирма')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Команда Бухфирма')).toBeInTheDocument()
    expect(
      screen.getAllByRole('heading', { name: 'Бухфирма' })[0],
    ).toBeInTheDocument()
    expect(getAdminBrandingMock).toHaveBeenCalledTimes(1)
  })

  it('updates preview while editing portal name', async () => {
    const user = userEvent.setup()

    renderAdminBrandingPage()

    const portalNameInput = await screen.findByLabelText('Название портала')
    await user.clear(portalNameInput)
    await user.type(portalNameInput, 'Портал Бухфирма')

    expect(
      screen.getByRole('heading', { name: 'Портал Бухфирма' }),
    ).toBeInTheDocument()
  })

  it('saves controlled branding settings', async () => {
    const user = userEvent.setup()

    renderAdminBrandingPage()

    const portalNameInput = await screen.findByLabelText('Название портала')
    await user.clear(portalNameInput)
    await user.type(portalNameInput, 'Новый портал')
    await user.click(
      screen.getByRole('button', { name: 'Сохранить настройки' }),
    )

    await waitFor(() => {
      expect(updateAdminBrandingMock).toHaveBeenCalledWith(
        expect.objectContaining({
          portalName: 'Новый портал',
        }),
      )
    })
  })

  it('shows API errors in Russian', async () => {
    getAdminBrandingMock.mockRejectedValueOnce(
      new Error('Админ вход сейчас недоступен. Попробуйте позже.'),
    )

    renderAdminBrandingPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Админ вход сейчас недоступен. Попробуйте позже.',
    )
  })

  it('keeps mobile blocker and logout behavior', async () => {
    const user = userEvent.setup()
    const adminSession = renderAdminBrandingPage()

    expect(
      screen.getByText('Админ-консоль доступна с широкого экрана'),
    ).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Выйти' })[0])

    expect(adminSession.signOut).toHaveBeenCalledTimes(1)
  })
})
