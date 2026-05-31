import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  AuthSessionContext,
  type AuthSessionContextValue,
} from '../../auth/lib/authSessionContext'
import { TenantIdentityContext } from '../../tenant/lib/tenantIdentityContext'
import { renderWithRouter } from '../../../test/renderWithRouter'
import type {
  ChatNotificationSettings,
  ChatSupportAvailabilityResponse,
  ChatThreadSummary,
} from '../types'
import { ChatHeader } from './ChatHeader'

const privateThread = {
  avatarUrl: '/api/tenant/icons/icon-192.png',
  id: 'private:me',
  subtitle: 'Вы и поддержка',
  title: 'Личный чат',
  type: 'private',
} satisfies ChatThreadSummary

const notificationSettings: ChatNotificationSettings = {
  effective: {
    newMessagesEnabled: true,
    pushEnabled: false,
    soundEnabled: true,
  },
  global: {
    newMessagesEnabled: true,
    pushEnabled: false,
    soundEnabled: true,
  },
  overrides: {
    newMessagesEnabled: null,
    pushEnabled: null,
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

function renderHeader({
  connectionStatus = 'online',
}: {
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
        <ChatHeader
          activeThread={privateThread}
          connectionStatus={connectionStatus}
          onOpenThreadInfo={vi.fn()}
          onOpenThreadMedia={vi.fn()}
          onOpenThreadNotifications={vi.fn()}
          onOpenThreadSearch={vi.fn()}
          onSelectThread={vi.fn()}
          selectedThreadId={privateThread.id}
          supportAvailability={supportAvailability}
          threadNotificationSettings={notificationSettings}
          threads={[privateThread]}
        />
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
})
