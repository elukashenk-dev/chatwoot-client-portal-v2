import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BrandingDraft } from '../../lib/brandingState'
import { PortalPreviewFrame } from './PortalPreviewFrame'

const draft = {
  assets: {
    logo: {
      assetVersion: '11',
      contentType: 'image/png',
      height: null,
      id: 11,
      kind: 'logo',
      publicUrl: '/api/branding/assets/11?v=11',
      width: null,
    },
  },
  colors: {
    accent: '#14b8a6',
    authBackground: '#ecfeff',
    authMutedText: '#456179',
    authText: '#0f172a',
    chatBackground: '#f8fafc',
    chatHeaderBackground: '#0f766e',
    chatHeaderText: '#f8fafc',
    chatMutedText: '#52637a',
    chatText: '#1f2937',
    primary: '#134e4a',
  },
  copy: {
    authSubtitle: 'Войдите в кабинет ProvGroup.',
    authTitle: 'Кабинет ProvGroup',
    chatEmptyBody: 'Напишите вопрос, мы ответим здесь.',
    chatEmptyTitle: 'Начните диалог',
    chatInfoTitle: 'О диалоге',
  },
  portalName: 'ProvGroup',
  supportLabel: 'Поддержка ProvGroup',
} satisfies BrandingDraft

describe('PortalPreviewFrame', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the portal preview inside a smartphone device frame', () => {
    const { container } = render(<PortalPreviewFrame draft={draft} />)

    const phonePreview = screen.getByRole('region', {
      name: 'Телефонный предпросмотр портала',
    })
    const deviceFrame = phonePreview.closest('[data-portal-preview-device]')

    expect(deviceFrame).toHaveClass('portal-preview-device')
    expect(phonePreview).toHaveClass('portal-preview-device-screen')
    expect(
      container.querySelector('[data-portal-preview-device-camera]'),
    ).toBeInTheDocument()
    expect(
      container.querySelector('[data-portal-preview-device-speaker]'),
    ).toBeInTheDocument()
  })

  it('adds Android-style status and navigation chrome around the preview', () => {
    const { container } = render(<PortalPreviewFrame draft={draft} />)

    expect(
      container.querySelector('[data-portal-preview-device-status-bar]'),
    ).toBeInTheDocument()
    expect(
      container.querySelector('[data-portal-preview-device-time]'),
    ).toHaveTextContent('12:59')
    expect(
      container.querySelector('[data-portal-preview-device-network]'),
    ).toBeInTheDocument()
    expect(
      container.querySelector('[data-portal-preview-device-wifi]'),
    ).toBeInTheDocument()
    expect(
      container.querySelector('[data-portal-preview-device-battery]'),
    ).toBeInTheDocument()
    expect(
      container.querySelector('[data-portal-preview-device-navigation]'),
    ).toBeInTheDocument()
    expect(
      container.querySelectorAll('[data-portal-preview-device-nav-control]'),
    ).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Войти' })).toBeDisabled()
  })

  it('renders only the first-slice preview screens', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    render(<PortalPreviewFrame draft={draft} />)

    const tablist = screen.getByRole('tablist', {
      name: 'Экраны предпросмотра портала',
    })

    expect(within(tablist).getByRole('tab', { name: 'Вход' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(
      within(tablist).getByRole('tab', { name: 'Чат' }),
    ).toBeInTheDocument()
    expect(
      within(tablist).getByRole('tab', { name: 'Инфо' }),
    ).toBeInTheDocument()
    expect(
      within(tablist).queryByRole('tab', { name: 'Настройки' }),
    ).not.toBeInTheDocument()
    expect(
      within(tablist).queryByRole('tab', { name: 'Уведомления' }),
    ).not.toBeInTheDocument()

    await user.click(within(tablist).getByRole('tab', { name: 'Чат' }))
    expect(
      screen.getByRole('heading', { name: 'Личный чат' }),
    ).toBeInTheDocument()

    await user.click(within(tablist).getByRole('tab', { name: 'Инфо' }))
    expect(
      screen.getByRole('heading', { name: 'О диалоге' }),
    ).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('renders the chat preview as read-only without runtime actions', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    render(<PortalPreviewFrame draft={draft} />)

    await user.click(screen.getByRole('tab', { name: 'Чат' }))

    const phonePreview = screen.getByRole('region', {
      name: 'Телефонный предпросмотр портала',
    })

    expect(
      within(phonePreview).getByRole('heading', { name: 'Личный чат' }),
    ).toBeInTheDocument()
    expect(within(phonePreview).getByText('Вы и поддержка')).toBeInTheDocument()
    expect(
      within(phonePreview).getByText('Здравствуйте, вижу ваше обращение.'),
    ).toBeInTheDocument()
    expect(
      within(phonePreview).getByText('И снова здравствуйте'),
    ).toBeInTheDocument()
    expect(
      within(phonePreview).getByText('Привет, сейчас посмотрю.'),
    ).toBeInTheDocument()
    expect(
      within(phonePreview).queryByRole('button', {
        name: 'Загрузить более ранние сообщения',
      }),
    ).not.toBeInTheDocument()
    expect(
      within(phonePreview).queryByRole('button', {
        name: 'К последним сообщениям',
      }),
    ).not.toBeInTheDocument()
    expect(
      within(phonePreview).queryByRole('button', {
        name: /Открыть меню чата|Открыть навигацию/,
      }),
    ).not.toBeInTheDocument()
    expect(
      within(phonePreview).queryByRole('button', {
        name: /Действия с сообщением/,
      }),
    ).not.toBeInTheDocument()
    expect(within(phonePreview).queryByRole('menu')).not.toBeInTheDocument()
    expect(within(phonePreview).queryByRole('link')).not.toBeInTheDocument()
    expect(
      within(phonePreview).getByRole('button', { name: 'Прикрепить файл' }),
    ).toBeDisabled()
    expect(
      within(phonePreview).getByRole('button', { name: 'Голосовое сообщение' }),
    ).toBeDisabled()
    expect(within(phonePreview).getByLabelText('Сообщение')).toBeDisabled()
    expect(
      within(phonePreview).getByRole('button', { name: 'Отправить' }),
    ).toBeDisabled()
    expect(
      screen.queryByRole('tab', { name: 'Настройки' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('tab', { name: 'Уведомления' }),
    ).not.toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('renders the chat info preview as read-only from the draft branding', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    render(<PortalPreviewFrame draft={draft} />)

    await user.click(screen.getByRole('tab', { name: 'Инфо' }))

    const phonePreview = screen.getByRole('region', {
      name: 'Телефонный предпросмотр портала',
    })

    expect(
      within(phonePreview).getByRole('heading', { name: 'О диалоге' }),
    ).toBeInTheDocument()
    expect(within(phonePreview).getByText('Личный чат')).toBeInTheDocument()
    expect(
      within(phonePreview).getByText('Поддержка ProvGroup'),
    ).toBeInTheDocument()
    expect(within(phonePreview).getByText('Часы работы')).toBeInTheDocument()
    expect(
      within(phonePreview).queryByRole('button', {
        name: 'Вернуться к чату',
      }),
    ).not.toBeInTheDocument()
    expect(
      within(phonePreview).queryByLabelText('Вернуться к чату'),
    ).not.toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('renders the login preview as read-only from the draft branding', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    render(<PortalPreviewFrame draft={draft} />)

    expect(
      screen.getByRole('region', { name: 'Телефонный предпросмотр портала' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Кабинет ProvGroup' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Войдите в кабинет ProvGroup.')).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Логотип ProvGroup' }),
    ).toHaveAttribute('src', '/api/branding/assets/11?v=11')
    expect(screen.getByLabelText('Email')).toBeDisabled()
    expect(screen.getByLabelText('Пароль')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Войти' })).toBeDisabled()
    expect(
      screen.queryByRole('link', { name: 'Забыли пароль?' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Создать аккаунт' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /\+7/ })).not.toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('updates the preview when the unsaved draft changes', () => {
    const updatedDraft = {
      ...draft,
      assets: {
        ...draft.assets,
        logo: {
          assetVersion: '12',
          contentType: 'image/png',
          height: null,
          id: 12,
          kind: 'logo',
          publicUrl: '/api/branding/assets/12?v=12',
          width: null,
        },
      },
      colors: {
        ...draft.colors,
        chatHeaderBackground: '#164e63',
        primary: '#0f766e',
      },
      copy: {
        ...draft.copy,
        authSubtitle: 'Используйте рабочий email.',
        authTitle: 'Вход для клиентов',
      },
      portalName: 'Портал Бухфирма',
      supportLabel: 'Поддержка 24/7',
    } satisfies BrandingDraft

    const { container, rerender } = render(<PortalPreviewFrame draft={draft} />)

    rerender(<PortalPreviewFrame draft={updatedDraft} />)

    expect(
      screen.getByRole('heading', { name: 'Вход для клиентов' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Используйте рабочий email.')).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Логотип Портал Бухфирма' }),
    ).toHaveAttribute('src', '/api/branding/assets/12?v=12')
    expect(container.querySelector('.portal-branding-scope')).toHaveStyle({
      '--color-brand-800': '#0f766e',
      '--portal-auth-text-color': '#0f172a',
      '--portal-chat-header-background-color': '#164e63',
      '--portal-chat-header-foreground': '#f8fafc',
      '--portal-chat-text-color': '#1f2937',
    })
  })
})
