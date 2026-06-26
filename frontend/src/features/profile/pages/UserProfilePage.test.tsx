import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ApiClientError,
  completePasswordSetup,
  requestPasswordSetup,
  verifyPasswordSetupCode,
} from '../../auth/api/authClient'
import type { AuthSessionContextValue } from '../../auth/lib/authSessionContext'
import { AuthSessionContext } from '../../auth/lib/authSessionContext'
import {
  getCurrentUserProfile,
  updateProfileAvatar,
} from '../api/profileClient'
import { UserProfilePage } from './UserProfilePage'

vi.mock('../../auth/api/authClient', async () => {
  const actual = await vi.importActual<typeof import('../../auth/api/authClient')>(
    '../../auth/api/authClient',
  )

  return {
    ...actual,
    completePasswordSetup: vi.fn(),
    requestPasswordSetup: vi.fn(),
    verifyPasswordSetupCode: vi.fn(),
  }
})

vi.mock('../api/profileClient', async () => {
  const actual = await vi.importActual<typeof import('../api/profileClient')>(
    '../api/profileClient',
  )

  return {
    ...actual,
    getCurrentUserProfile: vi.fn(),
    updateProfileAvatar: vi.fn(),
  }
})

const getCurrentUserProfileMock = vi.mocked(getCurrentUserProfile)
const completePasswordSetupMock = vi.mocked(completePasswordSetup)
const requestPasswordSetupMock = vi.mocked(requestPasswordSetup)
const updateProfileAvatarMock = vi.mocked(updateProfileAvatar)
const verifyPasswordSetupCodeMock = vi.mocked(verifyPasswordSetupCode)

function createAuthSession({
  passwordConfigured = true,
}: {
  passwordConfigured?: boolean
} = {}) {
  return {
    completeAuthenticatedSession: vi.fn(async () => undefined),
    errorMessage: null,
    localDeviceDataRemovalAvailable: false,
    refreshSession: vi.fn(async () => undefined),
    removeLocalDeviceData: vi.fn(async () => undefined),
    sessionSource: 'online',
    signIn: vi.fn(),
    signOut: vi.fn(async () => undefined),
    status: 'authenticated',
    user: {
      email: 'ivan@example.com',
      fullName: 'Иван Петров',
      id: 7,
      passwordConfigured,
    },
  } satisfies AuthSessionContextValue
}

function renderPage(authSession = createAuthSession()) {
  render(
    <MemoryRouter initialEntries={['/app/profile']}>
      <AuthSessionContext.Provider value={authSession}>
        <UserProfilePage />
      </AuthSessionContext.Provider>
    </MemoryRouter>,
  )

  return authSession
}

describe('UserProfilePage', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders readonly profile fields and the replace avatar action', async () => {
    getCurrentUserProfileMock.mockResolvedValueOnce({
      avatarUrl: '/api/profile/avatar',
      email: 'ivan@example.com',
      fullName: 'Иван Петров',
      phoneNumber: '+79991234567',
      result: 'ready',
    })

    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Профиль' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Иван Петров' })).toHaveAttribute(
      'src',
      '/api/profile/avatar',
    )
    expect(screen.getByText('Иван Петров')).toBeInTheDocument()
    expect(screen.getByText('ivan@example.com')).toBeInTheDocument()
    expect(screen.getByText('+79991234567')).toBeInTheDocument()
    expect(screen.getByLabelText('Заменить аватар')).toBeInTheDocument()
    expect(screen.getByText('Аватар').closest('section')).toHaveClass(
      'chat-glass-card-surface',
    )
    expect(screen.getByText('Аватар').parentElement?.parentElement).toHaveClass(
      'border-slate-300/45',
    )
    expect(screen.getByText('Имя').closest('div')).toHaveClass(
      'border-slate-300/45',
    )
    expect(screen.getByText('Пароль настроен')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Настроить пароль' }),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('Заменить аватар').closest('label')).toHaveClass(
      'border-white/65',
      'bg-white/60',
      'backdrop-blur-md',
    )
  })

  it('uploads an avatar and switches to the replace action', async () => {
    const user = userEvent.setup()
    const imageFile = new File(['avatar'], 'avatar.png', {
      type: 'image/png',
    })

    getCurrentUserProfileMock.mockResolvedValueOnce({
      avatarUrl: null,
      email: 'olga@example.com',
      fullName: 'Ольга Сидорова',
      phoneNumber: null,
      result: 'ready',
    })
    updateProfileAvatarMock.mockResolvedValueOnce({
      avatarUrl: '/api/profile/avatar',
      result: 'updated',
    })

    renderPage()

    await user.upload(
      await screen.findByLabelText('Загрузить аватар'),
      imageFile,
    )

    await waitFor(() => {
      expect(updateProfileAvatarMock).toHaveBeenCalledWith(imageFile)
    })
    expect(screen.getByText('Не указан')).toBeInTheDocument()
    expect(screen.getByText('Аватар обновлен.')).toBeInTheDocument()
    expect(screen.getByLabelText('Заменить аватар')).toBeInTheDocument()
  })

  it('rejects unsupported avatar files before calling the API', async () => {
    const user = userEvent.setup({ applyAccept: false })
    const textFile = new File(['avatar'], 'avatar.txt', {
      type: 'text/plain',
    })

    getCurrentUserProfileMock.mockResolvedValueOnce({
      avatarUrl: null,
      email: 'olga@example.com',
      fullName: 'Ольга Сидорова',
      phoneNumber: null,
      result: 'ready',
    })

    renderPage()

    await user.upload(
      await screen.findByLabelText('Загрузить аватар'),
      textFile,
    )

    expect(updateProfileAvatarMock).not.toHaveBeenCalled()
    expect(
      screen.getByText('Можно загрузить JPEG, PNG или GIF.'),
    ).toBeInTheDocument()
  })

  it('sets the first password through an email-code challenge', async () => {
    const user = userEvent.setup()
    const authSession = createAuthSession({ passwordConfigured: false })

    getCurrentUserProfileMock.mockResolvedValueOnce({
      avatarUrl: null,
      email: 'ivan@example.com',
      fullName: 'Иван Петров',
      phoneNumber: null,
      result: 'ready',
    })
    requestPasswordSetupMock.mockResolvedValueOnce({
      email: 'ivan@example.com',
      expiresInSeconds: 900,
      nextStep: 'verify_code',
      purpose: 'password_setup',
      resendAvailableInSeconds: 60,
      result: 'password_setup_requested',
    })
    verifyPasswordSetupCodeMock.mockResolvedValueOnce({
      continuationExpiresInSeconds: 900,
      continuationToken: 'password-setup-continuation-token',
      email: 'ivan@example.com',
      nextStep: 'set_password',
      purpose: 'password_setup',
      result: 'password_setup_verified',
    })
    completePasswordSetupMock.mockResolvedValueOnce({
      nextStep: 'chat',
      purpose: 'password_setup',
      result: 'password_setup_completed',
      session: {
        expiresAt: '2026-06-10T10:00:00.000Z',
      },
      user: {
        email: 'ivan@example.com',
        fullName: 'Иван Петров',
        id: 7,
        passwordConfigured: true,
      },
    })

    renderPage(authSession)

    await user.click(await screen.findByRole('button', {
      name: 'Настроить пароль',
    }))
    expect(requestPasswordSetupMock).toHaveBeenCalledWith()

    await user.click(await screen.findByLabelText('Код из письма'))
    await user.keyboard('123456')
    await user.click(screen.getByRole('button', { name: 'Подтвердить код' }))
    expect(verifyPasswordSetupCodeMock).toHaveBeenCalledWith({ code: '123456' })

    await user.type(screen.getByLabelText(/Новый пароль/), 'PortalPass123')
    await user.type(
      screen.getByLabelText(/Подтвердите пароль/),
      'PortalPass123',
    )
    await user.click(screen.getByRole('button', { name: 'Сохранить пароль' }))

    expect(completePasswordSetupMock).toHaveBeenCalledWith({
      continuationToken: 'password-setup-continuation-token',
      newPassword: 'PortalPass123',
    })
    expect(authSession.completeAuthenticatedSession).toHaveBeenCalledWith({
      session: {
        expiresAt: '2026-06-10T10:00:00.000Z',
      },
      user: {
        email: 'ivan@example.com',
        fullName: 'Иван Петров',
        id: 7,
        passwordConfigured: true,
      },
    })
    expect(await screen.findByText('Пароль настроен')).toBeInTheDocument()
  })

  it('returns to password setup request when the email code is expired', async () => {
    const user = userEvent.setup()
    const authSession = createAuthSession({ passwordConfigured: false })

    getCurrentUserProfileMock.mockResolvedValueOnce({
      avatarUrl: null,
      email: 'ivan@example.com',
      fullName: 'Иван Петров',
      phoneNumber: null,
      result: 'ready',
    })
    requestPasswordSetupMock.mockResolvedValueOnce({
      email: 'ivan@example.com',
      expiresInSeconds: 900,
      nextStep: 'verify_code',
      purpose: 'password_setup',
      resendAvailableInSeconds: 60,
      result: 'password_setup_requested',
    })
    verifyPasswordSetupCodeMock.mockRejectedValueOnce(
      new ApiClientError({
        code: 'PASSWORD_SETUP_CODE_EXPIRED',
        message: 'Срок действия кода подтверждения истек. Запросите новый код.',
        statusCode: 410,
      }),
    )

    renderPage(authSession)

    await user.click(await screen.findByRole('button', {
      name: 'Настроить пароль',
    }))
    await user.click(await screen.findByLabelText('Код из письма'))
    await user.keyboard('123456')
    await user.click(screen.getByRole('button', { name: 'Подтвердить код' }))

    expect(
      await screen.findByText(
        'Срок действия кода подтверждения истек. Запросите новый код.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Настроить пароль' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Код из письма')).not.toBeInTheDocument()
    expect(completePasswordSetupMock).not.toHaveBeenCalled()
  })

  it('returns to password setup request when continuation is invalid', async () => {
    const user = userEvent.setup()
    const authSession = createAuthSession({ passwordConfigured: false })

    getCurrentUserProfileMock.mockResolvedValueOnce({
      avatarUrl: null,
      email: 'ivan@example.com',
      fullName: 'Иван Петров',
      phoneNumber: null,
      result: 'ready',
    })
    requestPasswordSetupMock.mockResolvedValueOnce({
      email: 'ivan@example.com',
      expiresInSeconds: 900,
      nextStep: 'verify_code',
      purpose: 'password_setup',
      resendAvailableInSeconds: 60,
      result: 'password_setup_requested',
    })
    verifyPasswordSetupCodeMock.mockResolvedValueOnce({
      continuationExpiresInSeconds: 900,
      continuationToken: 'password-setup-continuation-token',
      email: 'ivan@example.com',
      nextStep: 'set_password',
      purpose: 'password_setup',
      result: 'password_setup_verified',
    })
    completePasswordSetupMock.mockRejectedValueOnce(
      new ApiClientError({
        code: 'PASSWORD_SETUP_CONTINUATION_INVALID',
        message:
          'Подтверждение создания пароля больше недействительно. Запросите новый код и попробуйте еще раз.',
        statusCode: 409,
      }),
    )

    renderPage(authSession)

    await user.click(await screen.findByRole('button', {
      name: 'Настроить пароль',
    }))
    await user.click(await screen.findByLabelText('Код из письма'))
    await user.keyboard('123456')
    await user.click(screen.getByRole('button', { name: 'Подтвердить код' }))
    await user.type(screen.getByLabelText(/Новый пароль/), 'PortalPass123')
    await user.type(
      screen.getByLabelText(/Подтвердите пароль/),
      'PortalPass123',
    )
    await user.click(screen.getByRole('button', { name: 'Сохранить пароль' }))

    expect(
      await screen.findByText(
        'Подтверждение создания пароля больше недействительно. Запросите новый код и попробуйте еще раз.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Настроить пароль' }),
    ).toBeInTheDocument()
    expect(authSession.completeAuthenticatedSession).not.toHaveBeenCalled()
  })
})
