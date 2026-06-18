import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BrandingDraft } from '../../lib/brandingState'
import { PortalPreviewFrame } from './PortalPreviewFrame'

const draft = {
  appearance: {
    authBackgroundOverlay: 'dark',
    authButtonStyle: 'gradient',
    authColorScheme: 'dark',
    authFieldStyle: 'outline',
  },
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
    authText: '#15486b',
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
  layout: {
    authBrandPlacement: 'left',
  },
  portalName: 'ProvGroup',
  supportLabel: 'Поддержка ProvGroup',
} satisfies BrandingDraft

const defaultDraft = {
  ...draft,
  colors: {
    accent: '#4676b4',
    authBackground: '#f3f7fc',
    authMutedText: '#64748b',
    authText: '#15486b',
    chatBackground: '#ffffff',
    chatHeaderBackground: '#ffffff',
    chatHeaderText: '#0f172a',
    chatMutedText: '#64748b',
    chatText: '#334155',
    primary: '#112540',
  },
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
    const loginButton = screen.getByRole('button', { name: 'Войти' })

    expect(loginButton).not.toHaveAttribute('disabled')
    expect(loginButton).toHaveAttribute('aria-disabled', 'true')
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
    const attachmentButton = within(phonePreview).getByRole('button', {
      name: 'Прикрепить файл',
    })
    const voiceButton = within(phonePreview).getByRole('button', {
      name: 'Голосовое сообщение',
    })
    const textarea = within(phonePreview).getByLabelText('Сообщение')
    const sendButton = within(phonePreview).getByRole('button', {
      name: 'Отправить',
    })

    expect(attachmentButton).toBeDisabled()
    expect(attachmentButton).toHaveClass(
      'transition',
      'hover:bg-white/55',
      'hover:text-chat-outgoing/90',
      'disabled:text-slate-300',
    )
    expect(voiceButton).toBeDisabled()
    expect(voiceButton).toHaveClass(
      'transition',
      'hover:bg-white/55',
      'hover:text-chat-outgoing/90',
      'disabled:text-slate-300',
    )
    expect(textarea).toBeDisabled()
    expect(textarea).toHaveClass(
      'chat-text',
      'disabled:text-[color:var(--portal-chat-muted-text-color,#64748b)]',
    )
    expect(textarea).not.toHaveClass('chat-muted-text')
    expect(sendButton).toBeDisabled()
    expect(sendButton).toHaveClass(
      'shadow-sm',
      'shadow-slate-900/10',
      'transition',
      'hover:bg-brand-900',
      'disabled:bg-slate-200/80',
      'disabled:text-white/80',
      'disabled:shadow-none',
    )
    expect(
      screen.queryByRole('tab', { name: 'Настройки' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('tab', { name: 'Уведомления' }),
    ).not.toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('uses production-like default CSS variables and semantic header controls in chat preview', async () => {
    const user = userEvent.setup()
    const { container } = render(<PortalPreviewFrame draft={defaultDraft} />)

    await user.click(screen.getByRole('tab', { name: 'Чат' }))

    expect(container.querySelector('.portal-branding-scope')).toHaveStyle({
      '--color-chat-outgoing': '#465a72',
      '--portal-chat-header-background-color': '#ffffff',
      '--portal-chat-header-control-border': 'rgb(193 193 193 / 34%)',
      '--portal-chat-header-control-surface': 'rgb(248 250 252 / 43%)',
      '--portal-chat-header-control-hover-text': '#112540',
      '--portal-chat-header-foreground': '#0f172a',
    })
    expect(container.querySelector('header')).toHaveClass('app-safe-top')
    expect(container.querySelector('header')).not.toHaveClass(
      'chat-header-background',
    )
    const floatingHeader = container.querySelector(
      '.chat-floating-header-surface',
    )
    const floatingComposer = container.querySelector(
      '.chat-floating-composer-surface',
    )

    expect(floatingHeader).toBeInstanceOf(HTMLElement)
    expect(floatingHeader).toHaveClass('py-[9px]')
    expect(floatingComposer).toBeInstanceOf(HTMLElement)
    expect(floatingComposer).toHaveClass('py-[9px]')
    expect(container.querySelector('.chat-header-icon-button')).toBeInstanceOf(
      HTMLElement,
    )
    expect(container.querySelector('.chat-header-menu-button')).toBeInstanceOf(
      HTMLElement,
    )
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

    const phonePreview = screen.getByRole('region', {
      name: 'Телефонный предпросмотр портала',
    })

    expect(phonePreview).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Кабинет ProvGroup' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Войдите в кабинет ProvGroup.')).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Логотип ProvGroup' }),
    ).toHaveAttribute('src', '/api/branding/assets/11?v=11')
    expect(document.querySelector('.auth-brand-mark')).toHaveClass(
      'auth-brand-mark--left',
    )
    const emailInput = screen.getByLabelText('Email')
    const passwordInput = screen.getByLabelText('Пароль')
    const mailIcon = document.querySelector('.auth-field-icon')

    expect(emailInput).toBeDisabled()
    expect(emailInput).toHaveClass('auth-input')
    expect(passwordInput).toBeDisabled()
    expect(passwordInput).toHaveClass('auth-input')
    expect(mailIcon).toHaveClass('z-10')
    const loginButton = screen.getByRole('button', { name: 'Войти' })

    expect(loginButton).not.toHaveAttribute('disabled')
    expect(loginButton).toHaveAttribute('aria-disabled', 'true')
    expect(
      document.querySelector('.auth-canvas-background'),
    ).toBeInTheDocument()
    expect(document.querySelector('.auth-stack')).toBeInTheDocument()
    expect(
      document.querySelector('.auth-brand-mark--in-flow'),
    ).toBeInTheDocument()
    expect(document.querySelector('.auth-header-shell')).not.toBeInTheDocument()
    expect(document.querySelector('.auth-footer-art')).not.toBeInTheDocument()
    expect(document.querySelector('.auth-input')).toBeInTheDocument()
    expect(document.querySelector('.auth-legal-text')).toHaveTextContent(
      /Используя сервис, вы принимаете Пользовательское соглашение и подтверждаете, что ознакомлены с Политикой обработки персональных данных\./i,
    )
    expect(document.querySelector('.auth-support-block')).toBeInTheDocument()
    expect(
      within(phonePreview).getByText('Нет доступа к чату?'),
    ).toBeInTheDocument()
    expect(
      within(phonePreview).getByText('+7 (800) 000-00-00'),
    ).toBeInTheDocument()
    expect(
      phonePreview.querySelector('.auth-link-separator'),
    ).toBeInTheDocument()
    expect(
      phonePreview.querySelector('.auth-support-divider .auth-support-icon'),
    ).toBeInTheDocument()
    expect(document.querySelector('.auth-support-card')).not.toBeInTheDocument()
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
      layout: {
        authBrandPlacement: 'right',
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
    expect(document.querySelector('.auth-brand-mark')).toHaveClass(
      'auth-brand-mark--right',
    )
    expect(container.querySelector('.portal-branding-scope')).toHaveStyle({
      '--color-brand-800': '#0f766e',
      '--portal-auth-brand-mark-background': '#0f766e',
      '--portal-auth-control-border-color': '#dddfe4',
      '--portal-auth-divider-color': '#c4c9d2',
      '--portal-auth-field-style': 'outline',
      '--portal-auth-text-color': '#15486b',
      '--portal-chat-header-background-color': '#164e63',
      '--portal-chat-header-foreground': '#f8fafc',
      '--portal-chat-text-color': '#1f2937',
    })
    expect(container.querySelector('.portal-branding-scope')).toHaveAttribute(
      'data-auth-field-style',
      'outline',
    )
    expect(
      container.querySelector('.portal-branding-scope')?.getAttribute('style'),
    ).not.toContain('--portal-auth-content-surface')
  })
})
