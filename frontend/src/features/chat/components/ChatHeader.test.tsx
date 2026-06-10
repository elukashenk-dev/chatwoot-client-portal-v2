import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
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
      authContentSurface: '#ffffff',
      authContentSurfaceOpacity: 100,
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
    version: 3,
  },
  errorMessage: null,
  status: 'ready',
}

const authSession: AuthSessionContextValue = {
  errorMessage: null,
  localDeviceDataRemovalAvailable: false,
  refreshSession: vi.fn(),
  removeLocalDeviceData: vi.fn(),
  sessionSource: 'online',
  signIn: vi.fn(),
  signOut: vi.fn(),
  status: 'authenticated',
  user: {
    email: 'name@group.ru',
    fullName: 'Portal User',
    id: 7,
  },
}

function CurrentPath() {
  const location = useLocation()

  return <output aria-label="current path">{location.pathname}</output>
}

function renderHeader({
  activeThread = privateThread,
  connectionStatus = 'online',
}: {
  activeThread?: ChatThreadListSummary
  connectionStatus?: 'connecting' | 'offline' | 'online'
} = {}) {
  renderWithRouter(
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
      <AuthSessionContext.Provider value={authSession}>
        <BrandingContext.Provider value={brandingContextValue}>
          <ChatHeader
            activeThread={activeThread}
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
        </BrandingContext.Provider>
      </AuthSessionContext.Provider>
    </TenantIdentityContext.Provider>,
    { initialEntries: ['/app/chat'] },
  )
}

describe('ChatHeader', () => {
  it('renders the active thread avatar image in the header', () => {
    renderHeader()

    expect(screen.getByRole('img', { name: 'Личный чат' })).toHaveAttribute(
      'src',
      '/api/tenant/icons/icon-192.png',
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

  it('prioritizes offline connection status over the support subtitle on mobile', () => {
    renderHeader({ connectionStatus: 'offline' })

    const subtitle = screen.getByText('Вы и поддержка')
    const offlineStatus = screen.getByRole('status', { name: 'Нет связи' })

    expect(subtitle).toHaveClass('hidden', 'sm:inline')
    expect(offlineStatus).toHaveClass('font-semibold', 'text-[#9f3141]')
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

    expect(screen.getByRole('banner')).toHaveClass('chat-header-border')
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

    expect(screen.getByText('Аккаунт')).toBeInTheDocument()
    expect(screen.getByText('Чат')).toBeInTheDocument()

    await user.click(screen.getByRole('menuitem', { name: 'Профиль' }))

    expect(screen.getByLabelText('current path')).toHaveTextContent(
      '/app/profile',
    )
  })
})
