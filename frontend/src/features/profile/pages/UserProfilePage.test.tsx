import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getCurrentUserProfile,
  updateProfileAvatar,
} from '../api/profileClient'
import { UserProfilePage } from './UserProfilePage'

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
const updateProfileAvatarMock = vi.mocked(updateProfileAvatar)

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/app/profile']}>
      <UserProfilePage />
    </MemoryRouter>,
  )
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
})
