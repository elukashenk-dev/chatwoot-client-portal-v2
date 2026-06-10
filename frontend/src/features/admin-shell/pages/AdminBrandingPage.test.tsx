import { act, fireEvent, screen, waitFor } from '@testing-library/react'
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
      authContentSurface: '#ffffff',
      authContentSurfaceOpacity: 100,
      authMutedText: '#64748b',
      authText: '#0f172a',
      chatBackground: '#ffffff',
      chatHeaderBackground: '#ffffff',
      chatHeaderText: '#0f172a',
      chatMutedText: '#64748b',
      chatText: '#334155',
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
      screen.getByRole('heading', { name: 'Копия портала' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Вход' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(
      screen.getByRole('heading', { name: 'Вход в личный кабинет' }),
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
      await screen.findByRole('region', {
        name: 'Телефонный предпросмотр портала',
      }),
    ).toHaveTextContent('Портал Бухфирма')
    expect(
      screen.getByRole('heading', { name: 'Вход в личный кабинет' }),
    ).toBeInTheDocument()
  })

  it('collapses the admin rail and resizes the sticky preview panel', async () => {
    const user = userEvent.setup()

    renderAdminBrandingPage()

    await screen.findByDisplayValue('Бухфирма')

    const layout = screen.getByRole('region', {
      name: 'Макет админки брендинга',
    })
    const sidebar = document.querySelector('[data-admin-branding-sidebar]')
    const preview = document.querySelector('[data-admin-branding-preview]')
    const resizeHandle = screen.getByRole('separator', {
      name: 'Изменить ширину предпросмотра',
    })

    expect(sidebar).toHaveClass('sticky', 'top-0', 'h-screen')
    expect(preview).toHaveClass('sticky', 'top-0', 'h-screen')
    expect(layout).toHaveStyle({
      gridTemplateColumns: '15rem minmax(0,1fr) 28rem',
    })
    expect(resizeHandle).toHaveAttribute('aria-valuenow', '28')
    expect(screen.getByRole('link', { name: 'Цвета' })).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Свернуть меню админки' }),
    )

    expect(
      screen.getByRole('button', { name: 'Развернуть меню админки' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Цвета' }),
    ).not.toBeInTheDocument()
    expect(layout).toHaveStyle({
      gridTemplateColumns: '4.5rem minmax(0,1fr) 28rem',
    })

    resizeHandle.focus()
    await user.keyboard('{ArrowLeft}')
    expect(resizeHandle).toHaveAttribute('aria-valuenow', '29')
    expect(layout).toHaveStyle({
      gridTemplateColumns: '4.5rem minmax(0,1fr) 29rem',
    })

    await user.keyboard('{End}')
    expect(resizeHandle).toHaveAttribute('aria-valuenow', '36')

    await user.keyboard('{ArrowRight}')
    expect(resizeHandle).toHaveAttribute('aria-valuenow', '35')

    await user.keyboard('{Home}')
    expect(resizeHandle).toHaveAttribute('aria-valuenow', '25')
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

  it('syncs selected picker color into the hex text field before saving', async () => {
    const user = userEvent.setup()

    renderAdminBrandingPage()

    const authTextInput = await screen.findByLabelText(
      'Цвет текста auth-экрана',
    )
    const authTextPicker = screen.getByLabelText(
      'Выбрать цвет текста auth-экрана',
    )

    expect(authTextInput).toHaveValue('#0f172a')

    fireEvent.input(authTextPicker, { target: { value: '#445566' } })

    expect(authTextInput).toHaveValue('#445566')

    await user.click(
      screen.getByRole('button', { name: 'Сохранить настройки' }),
    )

    await waitFor(() => {
      expect(updateAdminBrandingMock).toHaveBeenCalledWith(
        expect.objectContaining({
          colors: expect.objectContaining({
            authText: '#445566',
          }),
        }),
      )
    })
  })

  it('resets only color fields to default branding colors', async () => {
    const user = userEvent.setup()

    renderAdminBrandingPage()

    const portalNameInput = await screen.findByLabelText('Название портала')
    await user.clear(portalNameInput)
    await user.type(portalNameInput, 'Портал без изменения')

    fireEvent.input(screen.getByLabelText('Выбрать основной цвет'), {
      target: { value: '#445566' },
    })
    fireEvent.input(screen.getByLabelText('Выбрать цвет текста чата'), {
      target: { value: '#778899' },
    })

    expect(screen.getByLabelText('Основной цвет')).toHaveValue('#445566')
    expect(screen.getByLabelText('Цвет текста чата')).toHaveValue('#778899')

    await user.click(screen.getByRole('button', { name: 'Сбросить цвета' }))

    expect(screen.getByLabelText('Основной цвет')).toHaveValue('#112540')
    expect(screen.getByLabelText('Фон шапки чата')).toHaveValue('#ffffff')
    expect(screen.getByLabelText('Цвет текста чата')).toHaveValue('#334155')
    expect(screen.getByLabelText('Цвет текста шапки чата')).toHaveValue(
      '#0f172a',
    )
    expect(portalNameInput).toHaveValue('Портал без изменения')

    await user.click(
      screen.getByRole('button', { name: 'Сохранить настройки' }),
    )

    await waitFor(() => {
      expect(updateAdminBrandingMock).toHaveBeenCalledWith(
        expect.objectContaining({
          colors: expect.objectContaining({
            chatHeaderBackground: '#ffffff',
            chatHeaderText: '#0f172a',
            chatText: '#334155',
            primary: '#112540',
          }),
          portalName: 'Портал без изменения',
        }),
      )
    })
  })

  it('keeps chat header text readable when only the header background changes after reset', async () => {
    const user = userEvent.setup()

    renderAdminBrandingPage()

    await screen.findByLabelText('Название портала')

    await user.click(screen.getByRole('button', { name: 'Сбросить цвета' }))
    expect(screen.getByLabelText('Цвет текста шапки чата')).toHaveValue(
      '#0f172a',
    )

    fireEvent.input(screen.getByLabelText('Выбрать фон шапки чата'), {
      target: { value: '#164e63' },
    })

    expect(screen.getByLabelText('Фон шапки чата')).toHaveValue('#164e63')
    expect(screen.getByLabelText('Цвет текста шапки чата')).toHaveValue(
      '#ffffff',
    )

    fireEvent.input(screen.getByLabelText('Выбрать фон шапки чата'), {
      target: { value: '#ffffff' },
    })

    expect(screen.getByLabelText('Цвет текста шапки чата')).toHaveValue(
      '#0f172a',
    )

    await user.click(
      screen.getByRole('button', { name: 'Сохранить настройки' }),
    )

    await waitFor(() => {
      expect(updateAdminBrandingMock).toHaveBeenCalledWith(
        expect.objectContaining({
          colors: expect.objectContaining({
            chatHeaderBackground: '#ffffff',
            chatHeaderText: '#0f172a',
          }),
        }),
      )
    })
  })

  it('does not overwrite manually customized chat header text when header background changes', async () => {
    renderAdminBrandingPage()

    await screen.findByLabelText('Название портала')

    fireEvent.input(screen.getByLabelText('Выбрать цвет текста шапки чата'), {
      target: { value: '#445566' },
    })
    fireEvent.input(screen.getByLabelText('Выбрать фон шапки чата'), {
      target: { value: '#164e63' },
    })

    expect(screen.getByLabelText('Фон шапки чата')).toHaveValue('#164e63')
    expect(screen.getByLabelText('Цвет текста шапки чата')).toHaveValue(
      '#445566',
    )
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

  it('keeps save disabled while an asset action is in flight', async () => {
    const user = userEvent.setup()
    const deferredUpload = createDeferred<{ asset: typeof logoAsset }>()
    const imageFile = new File(['logo-bytes'], 'logo.png', {
      type: 'image/png',
    })

    uploadAdminBrandingAssetMock.mockReturnValueOnce(deferredUpload.promise)

    renderAdminBrandingPage()

    await user.upload(
      await screen.findByLabelText('Загрузить логотип'),
      imageFile,
    )

    expect(
      screen.getByRole('button', { name: 'Сохранить настройки' }),
    ).toBeDisabled()

    await act(async () => {
      deferredUpload.resolve({ asset: logoAsset })
      await deferredUpload.promise
    })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Сохранить настройки' }),
      ).toBeEnabled()
    })
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
