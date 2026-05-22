import { ChatInfoPage } from '../components/ChatInfoPage'
import { ChatMediaPage } from '../components/ChatMediaPage'
import { ChatNotificationsPage } from '../components/ChatNotificationsPage'
import { ChatSearchPage } from '../components/ChatSearchPage'
import type {
  ChatSearchResult,
  ChatSupportAvailabilityResponse,
  ChatThreadSummary,
} from '../types'
import type { useChatInfoPanel } from './useChatInfoPanel'
import type { useChatMediaPanel } from './useChatMediaPanel'
import type { useChatNotificationsPanel } from './useChatNotificationsPanel'
import type { useChatSearchPanel } from './useChatSearchPanel'

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
    <>
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
          onDisableDevicePush={() => {
            void chatNotificationsPanel.disableDevicePush()
          }}
          onEnablePushForThread={() => {
            void chatNotificationsPanel.enablePushForThread()
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
    </>
  )
}
