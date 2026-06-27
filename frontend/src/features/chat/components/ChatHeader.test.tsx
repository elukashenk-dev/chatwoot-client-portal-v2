import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLocation } from 'react-router-dom'

import {
  AuthSessionContext,
  type AuthSessionContextValue,
} from '../../auth/lib/authSessionContext'
import {
  BrandingContext,
  type BrandingContextValue,
} from '../../branding/lib/brandingContext'
import { TenantIdentityContext } from '../../tenant/lib/tenantIdentityContext'
import {
  PwaInstallPromptCapture,
  PwaInstallPromptProvider,
} from '../../../pwa/installPromptRuntime'
import { pwaInstallPromptInternalsForTests } from '../../../pwa/installPromptContext'
import { renderWithRouter } from '../../../test/renderWithRouter'
import type {
  ChatNotificationSettings,
  ChatSupportAvailabilityResponse,
  ChatThreadListSummary,
} from '../types'
import { ChatHeader } from './ChatHeader'

const privateThread = {
  avatarUrl: '/api/tenant/icons/icon-192.png',
  id: 'private:me',
  subtitle: 'Вы и поддержка',
  title: 'Личный чат',
  type: 'private',
  unreadCount: 0,
} satisfies ChatThreadListSummary

const notificationSettings: ChatNotificationSettings = {
  effective: {
    newMessagesEnabled: true,
    soundEnabled: true,
  },
  global: {
    newMessagesEnabled: true,
    soundEnabled: true,
  },
  overrides: {
    newMessagesEnabled: null,
    soundEnabled: null,
  },
  threadId: privateThread.id,
}

const supportAvailability: ChatSupportAvailabilityResponse = {
  currentStatus: 'online',
  outOfOfficeMessage: null,
  reason: 'none',
  result: 'ready',
  workingHours: {
    enabled: false,
    isWithinWorkingHours: null,
    rows: [],
    timezone: 'UTC',
  },
}

const brandingContextValue: BrandingContextValue = {
  branding: {
    appearance: {
      authBackgroundOverlay: 'none',
      authButtonStyle: 'solid',
      authColorScheme: 'light',
      authFieldStyle: 'solid',
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
    supportContact: {
      phoneDisplay: null,
      phoneHref: null,
    },
    supportLabel: 'Поддержка ProvGroup',
    version: 3,
  },
  errorMessage: null,
  status: 'ready',
}

const authenticatedUser = {
  email: 'name@group.ru',
  fullName: 'Portal User',
  id: 7,
  passwordConfigured: true,
} satisfies NonNullable<AuthSessionContextValue['user']>

const authSession: AuthSessionContextValue = {
  completeAuthenticatedSession: vi.fn(async () => undefined),
  errorMessage: null,
  localDeviceDataRemovalAvailable: false,
  refreshSession: vi.fn(),
  removeLocalDeviceData: vi.fn(),
  sessionSource: 'online',
  signIn: vi.fn(),
  signOut: vi.fn(),
  status: 'authenticated',
  user: authenticatedUser,
}

type MockBeforeInstallPromptEvent = Event & {
  prompt: ReturnType<typeof vi.fn<() => Promise<void>>>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function createBeforeInstallPromptEvent(): MockBeforeInstallPromptEvent {
  const event = new Event('beforeinstallprompt', {
    cancelable: true,
  }) as MockBeforeInstallPromptEvent

  event.prompt = vi.fn().mockResolvedValue(undefined)
  event.userChoice = Promise.resolve({
    outcome: 'accepted',
    platform: 'web',
  })

  return event
}

function CurrentPath() {
  const location = useLocation()

  return <output aria-label="current path">{location.pathname}</output>
}

function renderHeader({
  activeThread = privateThread,
  authValue = authSession,
  brandingValue = brandingContextValue,
  canShowInstallApp = true,
  connectionStatus = 'online',
}: {
  activeThread?: ChatThreadListSummary
  authValue?: AuthSessionContextValue
  brandingValue?: BrandingContextValue
  canShowInstallApp?: boolean
  connectionStatus?: 'connecting' | 'offline' | 'online'
} = {}) {
  renderWithRouter(
    <>
      <PwaInstallPromptCapture />
      <TenantIdentityContext.Provider
        value={{
          errorMessage: null,
          isUsingCachedData: false,
          status: 'ready',
          tenant: {
            displayName: 'ProvGroup',
            primaryDomain: 'lk.example.test',
            publicBaseUrl: 'https://lk.example.test',
            slug: 'provgroup',
          },
        }}
      >
        <AuthSessionContext.Provider value={authValue}>
          <BrandingContext.Provider value={brandingValue}>
            <PwaInstallPromptProvider>
              <ChatHeader
                activeThread={activeThread}
                canShowInstallApp={canShowInstallApp}
                connectionStatus={connectionStatus}
                onOpenThreadInfo={vi.fn()}
                onOpenThreadMedia={vi.fn()}
                onOpenThreadNotifications={vi.fn()}
                onOpenThreadSearch={vi.fn()}
                onSelectThread={vi.fn()}
                selectedThreadId={activeThread.id}
                supportAvailability={supportAvailability}
                threadNotificationSettings={notificationSettings}
                threads={[activeThread]}
              />
              <CurrentPath />
            </PwaInstallPromptProvider>
          </BrandingContext.Provider>
        </AuthSessionContext.Provider>
      </TenantIdentityContext.Provider>
    </>,
    { initialEntries: ['/app/chat'] },
  )
}

describe('ChatHeader', () => {
  beforeEach(() => {
    pwaInstallPromptInternalsForTests.resetPromptEventSnapshot()
  })

  it('renders the branded logo image in the header before thread avatar fallback', () => {
    renderHeader()

    expect(screen.getByRole('img', { name: 'Личный чат' })).toHaveAttribute(
      'src',
      '/api/branding/assets/11?v=11',
    )
  })

  it('keeps an explicit group thread avatar over the uploaded branding logo', () => {
    renderHeader({
      activeThread: {
        avatarUrl: '/api/chat/threads/group%3A154/avatar',
        id: 'group:154',
        subtitle: 'Групповой чат',
        title: 'ООО "Ромашка"',
        type: 'group',
        unreadCount: 0,
      },
    })

    expect(screen.getByRole('img', { name: 'ООО "Ромашка"' })).toHaveAttribute(
      'src',
      '/api/chat/threads/group%3A154/avatar',
    )
  })

  it('uses public branding as header fallback when the thread has no avatar or subtitle', () => {
    renderHeader({
      activeThread: {
        ...privateThread,
        avatarUrl: null,
        subtitle: '',
      },
    })

    expect(screen.getByRole('img', { name: 'Личный чат' })).toHaveAttribute(
      'src',
      '/api/branding/assets/11?v=11',
    )
    expect(screen.getByText('Поддержка ProvGroup')).toBeInTheDocument()
  })

  it('falls back to the active thread avatar when branding logo is unavailable', () => {
    renderHeader({
      brandingValue: {
        ...brandingContextValue,
        branding: {
          ...brandingContextValue.branding,
          assets: {},
        },
      },
    })

    expect(screen.getByRole('img', { name: 'Личный чат' })).toHaveAttribute(
      'src',
      '/api/tenant/icons/icon-192.png',
    )
  })

  it('prioritizes offline connection status over the support subtitle on mobile', () => {
    renderHeader({ connectionStatus: 'offline' })

    const subtitle = screen.getByText('Вы и поддержка')
    const offlineStatus = screen.getByRole('status', { name: 'Нет связи' })

    expect(subtitle).toHaveClass('hidden', 'sm:inline')
    expect(offlineStatus).toHaveClass('font-normal', 'text-[#9f3141]')
  })

  it('shows connecting status while cached chat is checking the backend', () => {
    renderHeader({ connectionStatus: 'connecting' })

    expect(
      screen.getByRole('status', { name: 'Соединение...' }),
    ).toBeInTheDocument()
  })

  it('shows support availability when backend is reachable', () => {
    renderHeader({ connectionStatus: 'online' })

    expect(screen.getByRole('status', { name: 'На связи' })).toBeInTheDocument()
  })

  it('uses semantic header control classes for light and dark branded headers', () => {
    renderHeader()

    expect(screen.getByRole('banner')).toHaveClass('app-safe-top')
    expect(screen.getByRole('banner')).not.toHaveClass('chat-header-background')
    const floatingHeader = screen
      .getByRole('banner')
      .querySelector('[data-chat-floating-surface="header"]')

    expect(floatingHeader).not.toBeNull()
    expect(
      screen.getByRole('button', { name: 'Открыть навигацию' }),
    ).toHaveClass('chat-header-icon-button')
    expect(
      screen.getByRole('button', { name: 'Открыть меню чата' }),
    ).toHaveClass('chat-header-menu-button')
  })

  it('groups the right chat menu and navigates to profile', async () => {
    const user = userEvent.setup()

    renderHeader()

    await user.click(screen.getByRole('button', { name: 'Открыть меню чата' }))

    const menu = screen.getByRole('menu')

    expect(menu).toHaveClass('portal-menu-surface', 'border-white/65')
    expect(menu).toHaveAttribute('data-chat-header-menu', 'actions')
    expect(menu.closest('[data-chat-floating-surface="header"]')).toBeNull()
    expect(menu).not.toHaveClass('border-slate-200/90')
    expect(screen.getByText('Аккаунт')).toBeInTheDocument()
    expect(screen.getByText('Чат')).toBeInTheDocument()
    expect(
      screen.queryByRole('menuitem', { name: 'Установить приложение' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Профиль' })).toHaveClass(
      'border-slate-300/45',
      'hover:bg-white/45',
    )

    await user.click(screen.getByRole('menuitem', { name: 'Профиль' }))

    expect(screen.getByLabelText('current path')).toHaveTextContent(
      '/app/profile',
    )
  })

  it('logs out configured-password users without a passwordless warning', async () => {
    const user = userEvent.setup()
    const signOut = vi.fn(async () => undefined)

    renderHeader({
      authValue: {
        ...authSession,
        signOut,
        user: {
          ...authenticatedUser,
          passwordConfigured: true,
        },
      },
    })

    await user.click(screen.getByRole('button', { name: 'Открыть меню чата' }))
    await user.click(screen.getByRole('menuitem', { name: 'Выход' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(signOut).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.getByLabelText('current path')).toHaveTextContent(
        '/auth/login',
      )
    })
  })

  it('warns passwordless users before logout and can cancel the action', async () => {
    const user = userEvent.setup()
    const signOut = vi.fn(async () => undefined)

    renderHeader({
      authValue: {
        ...authSession,
        signOut,
        user: {
          ...authenticatedUser,
          passwordConfigured: false,
        },
      },
    })

    await user.click(screen.getByRole('button', { name: 'Открыть меню чата' }))
    await user.click(screen.getByRole('menuitem', { name: 'Выход' }))

    const dialog = screen.getByRole('dialog', { name: 'Выйти из аккаунта?' })

    expect(dialog).toHaveTextContent(
      'У вас пока не задан пароль. После выхода вы сможете снова войти только по коду из почты. Задать пароль можно в профиле.',
    )
    expect(screen.getByRole('link', { name: 'профиле' })).toHaveAttribute(
      'href',
      '/app/profile',
    )
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Остаться' })).toHaveFocus()
    })
    expect(signOut).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Остаться' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(signOut).not.toHaveBeenCalled()
    expect(screen.getByLabelText('current path')).toHaveTextContent('/app/chat')
  })

  it('opens profile from the passwordless logout warning without signing out', async () => {
    const user = userEvent.setup()
    const signOut = vi.fn(async () => undefined)

    renderHeader({
      authValue: {
        ...authSession,
        signOut,
        user: {
          ...authenticatedUser,
          passwordConfigured: false,
        },
      },
    })

    await user.click(screen.getByRole('button', { name: 'Открыть меню чата' }))
    await user.click(screen.getByRole('menuitem', { name: 'Выход' }))
    await user.click(screen.getByRole('link', { name: 'профиле' }))

    expect(signOut).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByLabelText('current path')).toHaveTextContent(
        '/app/profile',
      )
    })
  })

  it('logs out passwordless users only after warning confirmation', async () => {
    const user = userEvent.setup()
    const signOut = vi.fn(async () => undefined)

    renderHeader({
      authValue: {
        ...authSession,
        signOut,
        user: {
          ...authenticatedUser,
          passwordConfigured: false,
        },
      },
    })

    await user.click(screen.getByRole('button', { name: 'Открыть меню чата' }))
    await user.click(screen.getByRole('menuitem', { name: 'Выход' }))
    await user.click(screen.getByRole('button', { name: 'Выйти' }))

    expect(signOut).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByLabelText('current path')).toHaveTextContent(
        '/auth/login',
      )
    })
  })

  it('closes the passwordless logout warning on Escape and restores menu button focus', async () => {
    const user = userEvent.setup()
    const signOut = vi.fn(async () => undefined)

    renderHeader({
      authValue: {
        ...authSession,
        signOut,
        user: {
          ...authenticatedUser,
          passwordConfigured: false,
        },
      },
    })

    const menuButton = screen.getByRole('button', { name: 'Открыть меню чата' })

    await user.click(menuButton)
    await user.click(screen.getByRole('menuitem', { name: 'Выход' }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(signOut).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(menuButton).toHaveFocus()
    })
  })

  it('shows install app action when the PWA native prompt is available', async () => {
    const user = userEvent.setup()
    const installEvent = createBeforeInstallPromptEvent()

    renderHeader()

    await act(async () => {
      window.dispatchEvent(installEvent)
    })

    await user.click(screen.getByRole('button', { name: 'Открыть меню чата' }))
    await user.click(
      screen.getByRole('menuitem', { name: 'Установить приложение' }),
    )

    expect(installEvent.prompt).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('hides install app action while the chat install surface is unavailable', async () => {
    const user = userEvent.setup()
    const installEvent = createBeforeInstallPromptEvent()

    renderHeader({ canShowInstallApp: false })

    await act(async () => {
      window.dispatchEvent(installEvent)
    })

    await user.click(screen.getByRole('button', { name: 'Открыть меню чата' }))

    expect(
      screen.queryByRole('menuitem', { name: 'Установить приложение' }),
    ).not.toBeInTheDocument()
    expect(installEvent.prompt).not.toHaveBeenCalled()
  })

  it('uses a glass surface for the navigation menu', async () => {
    const user = userEvent.setup()

    renderHeader()

    await user.click(screen.getByRole('button', { name: 'Открыть навигацию' }))

    const menu = screen.getByRole('menu')

    expect(menu).toHaveClass('portal-menu-surface', 'border-white/65')
    expect(menu).toHaveAttribute('data-chat-header-menu', 'navigation')
    expect(menu.closest('[data-chat-floating-surface="header"]')).toBeNull()
    expect(menu).not.toHaveClass('border-slate-200/80')
    const supportCenterItem = screen.getByRole('menuitem', {
      name: 'Центр поддержки - скоро',
    })

    expect(supportCenterItem).toBeDisabled()
    expect(supportCenterItem).toHaveClass(
      'text-slate-400',
      'cursor-not-allowed',
    )
    expect(supportCenterItem).not.toHaveClass('hover:bg-white/45')
    expect(screen.getByRole('menuitem', { name: 'Настройки' })).toHaveClass(
      'hover:bg-white/45',
    )
  })
})
