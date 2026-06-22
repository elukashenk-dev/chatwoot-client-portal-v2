import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.doUnmock('../components/ChatMediaPage')
  vi.resetModules()
})

function createClosedChatInfoPanel() {
  return {
    closeChatInfo: vi.fn(),
    loadChatInfo: vi.fn(),
    retryChatInfo: vi.fn(),
    state: {
      info: null,
      isLoading: false,
      isOpen: false,
    },
  }
}

function createClosedChatNotificationsPanel() {
  return {
    closeChatNotifications: vi.fn(),
    connectDevicePush: vi.fn(),
    disableDevicePush: vi.fn(),
    loadChatNotificationSettings: vi.fn(),
    loadChatNotifications: vi.fn(),
    resetThreadOverrides: vi.fn(),
    retryChatNotifications: vi.fn(),
    state: {
      browserPush: null,
      errorMessage: null,
      isLoading: false,
      isOpen: false,
      isUpdating: false,
      settings: null,
      settingsThreadId: null,
    },
    updateSettings: vi.fn(),
  }
}

function createClosedChatSearchPanel() {
  return {
    closeChatSearch: vi.fn(),
    loadOlderChatSearch: vi.fn(),
    openChatSearch: vi.fn(),
    retryChatSearch: vi.fn(),
    state: {
      isLoading: false,
      isLoadingOlder: false,
      isOpen: false,
      olderSearchErrorMessage: null,
      query: '',
      search: null,
    },
    updateChatSearchQuery: vi.fn(),
  }
}

describe('ChatAuxiliaryPages', () => {
  it('shows a full-screen loading shell while a lazy panel chunk loads', async () => {
    const user = userEvent.setup()
    const closeChatMedia = vi.fn()

    vi.resetModules()
    vi.doMock('../components/ChatMediaPage', () => new Promise(() => {}))
    const { ChatAuxiliaryPages } = await import('./ChatAuxiliaryPages')

    render(
      <ChatAuxiliaryPages
        activeThread={null}
        chatInfoPanel={createClosedChatInfoPanel()}
        chatMediaPanel={{
          closeChatMedia,
          loadChatMedia: vi.fn(),
          loadOlderChatMedia: vi.fn(),
          retryChatMedia: vi.fn(),
          state: {
            isLoading: true,
            isLoadingOlder: false,
            isOpen: true,
            media: null,
          },
        }}
        chatNotificationsPanel={createClosedChatNotificationsPanel()}
        chatSearchPanel={createClosedChatSearchPanel()}
        onSearchBack={vi.fn()}
        onSearchQueryChange={vi.fn()}
        onSearchResultSelect={vi.fn()}
        searchResultOpenErrorMessage={null}
        supportAvailability={null}
        supportAvailabilityIsLoading={false}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Открываем раздел' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Открываем раздел чата: Медиа и файлы.'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Вернуться к чату' }))

    expect(closeChatMedia).toHaveBeenCalledTimes(1)
  })
})
