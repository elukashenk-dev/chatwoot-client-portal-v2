import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminBrandingResponse } from '../../admin-branding/api/adminBrandingClient'
import { renderWithRouter } from '../../../test/renderWithRouter'
import {
  AdminSessionContext,
  type AdminSessionContextValue,
} from '../../admin-auth/lib/adminSessionContext'
import { AdminBrandingPage } from './AdminBrandingPage'

const {
  deleteAdminBrandingAssetMock,
  getAdminBrandingMock,
  updateAdminBrandingMock,
  uploadAdminBrandingAssetMock,
} = vi.hoisted(() => ({
  deleteAdminBrandingAssetMock: vi.fn(),
  getAdminBrandingMock: vi.fn(),
  updateAdminBrandingMock: vi.fn(),
  uploadAdminBrandingAssetMock: vi.fn(),
}))

vi.mock('../../admin-branding/api/adminBrandingClient', () => ({
  deleteAdminBrandingAsset: deleteAdminBrandingAssetMock,
  getAdminBranding: getAdminBrandingMock,
  updateAdminBranding: updateAdminBrandingMock,
  uploadAdminBrandingAsset: uploadAdminBrandingAssetMock,
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

const logoAsset = {
  assetVersion: '77',
  contentType: 'image/png',
  height: null,
  id: 77,
  kind: 'logo',
  publicUrl: '/api/branding/assets/77?v=77',
  width: null,
} satisfies NonNullable<AdminBrandingResponse['branding']['assets']['logo']>

function createBrandingResponse(
  overrides: Partial<AdminBrandingResponse['branding']> = {},
) {
  return {
    branding: {
      ...savedBrandingResponse.branding,
      ...overrides,
    },
  } satisfies AdminBrandingResponse
}

function createDeferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })

  return { promise, resolve }
}

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
    deleteAdminBrandingAssetMock.mockReset()
    getAdminBrandingMock.mockReset()
    updateAdminBrandingMock.mockReset()
    uploadAdminBrandingAssetMock.mockReset()

    deleteAdminBrandingAssetMock.mockResolvedValue({ deleted: true })
    getAdminBrandingMock.mockResolvedValue(savedBrandingResponse)
    updateAdminBrandingMock.mockResolvedValue(savedBrandingResponse)
    uploadAdminBrandingAssetMock.mockResolvedValue({ asset: logoAsset })
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
    updateAdminBrandingMock.mockResolvedValueOnce(
      createBrandingResponse({ portalName: 'Новый портал', version: 2 }),
    )

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
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Настройки сохранены.',
    )

    await user.type(portalNameInput, ' 2')

    expect(screen.queryByText('Настройки сохранены.')).not.toBeInTheDocument()
  })

  it('refreshes assets after upload without overwriting unsaved text edits', async () => {
    const user = userEvent.setup()
    const imageFile = new File(['logo-bytes'], 'logo.png', {
      type: 'image/png',
    })

    getAdminBrandingMock
      .mockResolvedValueOnce(savedBrandingResponse)
      .mockResolvedValueOnce(
        createBrandingResponse({
          assets: { logo: logoAsset },
          portalName: 'Бухфирма',
        }),
      )

    renderAdminBrandingPage()

    const portalNameInput = await screen.findByLabelText('Название портала')
    await user.clear(portalNameInput)
    await user.type(portalNameInput, 'Несохраненное имя')
    await user.upload(screen.getByLabelText('Загрузить логотип'), imageFile)

    await waitFor(() => {
      expect(uploadAdminBrandingAssetMock).toHaveBeenCalledWith(
        'logo',
        imageFile,
      )
    })
    expect(screen.getByLabelText('Название портала')).toHaveValue(
      'Несохраненное имя',
    )
    expect(await screen.findByAltText('Логотип')).toHaveAttribute(
      'src',
      '/api/branding/assets/77?v=77',
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Логотип загружен.',
    )
  })

  it('deletes a branding asset and refreshes the slot', async () => {
    const user = userEvent.setup()

    getAdminBrandingMock
      .mockResolvedValueOnce(
        createBrandingResponse({ assets: { logo: logoAsset } }),
      )
      .mockResolvedValueOnce(savedBrandingResponse)

    renderAdminBrandingPage()

    await user.click(
      await screen.findByRole('button', { name: 'Удалить логотип' }),
    )

    await waitFor(() => {
      expect(deleteAdminBrandingAssetMock).toHaveBeenCalledWith('logo')
    })
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Логотип удален.',
    )
    expect(screen.getByLabelText('Загрузить логотип')).toBeInTheDocument()
  })

  it('blocks form edits while saving to avoid stale response overwrite', async () => {
    const user = userEvent.setup()
    const deferredSave = createDeferred<AdminBrandingResponse>()

    updateAdminBrandingMock.mockReturnValueOnce(deferredSave.promise)

    renderAdminBrandingPage()

    const portalNameInput = await screen.findByLabelText('Название портала')
    await user.clear(portalNameInput)
    await user.type(portalNameInput, 'Новый портал')
    await user.click(
      screen.getByRole('button', { name: 'Сохранить настройки' }),
    )

    expect(screen.getByRole('button', { name: 'Сохраняем' })).toBeDisabled()
    expect(portalNameInput).toBeDisabled()

    await act(async () => {
      deferredSave.resolve(
        createBrandingResponse({ portalName: 'Новый портал', version: 2 }),
      )
      await deferredSave.promise
    })

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Настройки сохранены.',
    )
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
