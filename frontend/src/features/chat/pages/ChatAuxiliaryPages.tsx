import { lazy, Suspense, type ComponentType } from 'react'

import type {
  ChatSearchResult,
  ChatSupportAvailabilityResponse,
  ChatThreadSummary,
} from '../types'
import type { useChatInfoPanel } from './useChatInfoPanel'
import type { useChatMediaPanel } from './useChatMediaPanel'
import type { useChatNotificationsPanel } from './useChatNotificationsPanel'
import type { useChatSearchPanel } from './useChatSearchPanel'

function lazyPanel<TProps extends object>(
  loadComponent: () => Promise<ComponentType<TProps>>,
) {
  return lazy(async () => ({
    default: await loadComponent(),
  }))
}

const ChatInfoPage = lazyPanel(() =>
  import('../components/ChatInfoPage').then((module) => module.ChatInfoPage),
)
const ChatMediaPage = lazyPanel(() =>
  import('../components/ChatMediaPage').then((module) => module.ChatMediaPage),
)
const ChatNotificationsPage = lazyPanel(() =>
  import('../components/ChatNotificationsPage').then(
    (module) => module.ChatNotificationsPage,
  ),
)
const ChatSearchPage = lazyPanel(() =>
  import('../components/ChatSearchPage').then((module) => module.ChatSearchPage),
)

type ChatAuxiliaryPagesProps = {
  activeThread: ChatThreadSummary | null
  chatInfoPanel: ReturnType<typeof useChatInfoPanel>
  chatMediaPanel: ReturnType<typeof useChatMediaPanel>
  chatNotificationsPanel: ReturnType<typeof useChatNotificationsPanel>
  chatSearchPanel: ReturnType<typeof useChatSearchPanel>
  onSearchBack: () => void
  onSearchQueryChange: (query: string) => void
  onSearchResultSelect: (result: ChatSearchResult) => void
  searchResultOpenErrorMessage: string | null
  supportAvailability: ChatSupportAvailabilityResponse | null
  supportAvailabilityIsLoading: boolean
}

export function ChatAuxiliaryPages({
  activeThread,
  chatInfoPanel,
  chatMediaPanel,
  chatNotificationsPanel,
  chatSearchPanel,
  onSearchBack,
  onSearchQueryChange,
  onSearchResultSelect,
  searchResultOpenErrorMessage,
  supportAvailability,
  supportAvailabilityIsLoading,
}: ChatAuxiliaryPagesProps) {
  return (
    <Suspense fallback={null}>
      {chatInfoPanel.state.isOpen ? (
        <ChatInfoPage
          info={chatInfoPanel.state.info}
          isLoading={chatInfoPanel.state.isLoading}
          isSupportAvailabilityLoading={supportAvailabilityIsLoading}
          onBack={chatInfoPanel.closeChatInfo}
          onRetry={() => {
            void chatInfoPanel.retryChatInfo()
          }}
          supportAvailability={supportAvailability}
        />
      ) : null}
      {chatNotificationsPanel.state.isOpen ? (
        <ChatNotificationsPage
          activeThread={activeThread}
          onBack={chatNotificationsPanel.closeChatNotifications}
          onConnectDevicePush={() => {
            void chatNotificationsPanel.connectDevicePush()
          }}
          onDisableDevicePush={() => {
            void chatNotificationsPanel.disableDevicePush()
          }}
          onResetThreadOverrides={() => {
            void chatNotificationsPanel.resetThreadOverrides()
          }}
          onRetry={() => {
            void chatNotificationsPanel.retryChatNotifications()
          }}
          onUpdateSetting={(patch) => {
            void chatNotificationsPanel.updateSettings(patch)
          }}
          state={chatNotificationsPanel.state}
        />
      ) : null}
      {chatMediaPanel.state.isOpen ? (
        <ChatMediaPage
          isLoading={chatMediaPanel.state.isLoading}
          isLoadingOlder={chatMediaPanel.state.isLoadingOlder}
          media={chatMediaPanel.state.media}
          onBack={chatMediaPanel.closeChatMedia}
          onLoadOlder={() => {
            void chatMediaPanel.loadOlderChatMedia()
          }}
          onRetry={() => {
            void chatMediaPanel.retryChatMedia()
          }}
        />
      ) : null}
      {chatSearchPanel.state.isOpen ? (
        <ChatSearchPage
          activeThread={activeThread}
          isLoading={chatSearchPanel.state.isLoading}
          isLoadingOlder={chatSearchPanel.state.isLoadingOlder}
          olderSearchErrorMessage={
            chatSearchPanel.state.olderSearchErrorMessage
          }
          onBack={onSearchBack}
          onLoadOlder={() => {
            void chatSearchPanel.loadOlderChatSearch()
          }}
          onQueryChange={onSearchQueryChange}
          onRetry={() => {
            void chatSearchPanel.retryChatSearch()
          }}
          onResultSelect={onSearchResultSelect}
          query={chatSearchPanel.state.query}
          resultOpenErrorMessage={searchResultOpenErrorMessage}
          search={chatSearchPanel.state.search}
        />
      ) : null}
    </Suspense>
  )
}
