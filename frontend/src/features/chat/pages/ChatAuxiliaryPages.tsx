import { ChatInfoPage } from '../components/ChatInfoPage'
import { ChatMediaPage } from '../components/ChatMediaPage'
import { ChatSearchPage } from '../components/ChatSearchPage'
import type { ChatSearchResult, ChatThreadSummary } from '../types'
import type { useChatInfoPanel } from './useChatInfoPanel'
import type { useChatMediaPanel } from './useChatMediaPanel'
import type { useChatSearchPanel } from './useChatSearchPanel'

type ChatAuxiliaryPagesProps = {
  activeThread: ChatThreadSummary | null
  chatInfoPanel: ReturnType<typeof useChatInfoPanel>
  chatMediaPanel: ReturnType<typeof useChatMediaPanel>
  chatSearchPanel: ReturnType<typeof useChatSearchPanel>
  onSearchResultSelect: (result: ChatSearchResult) => void
}

export function ChatAuxiliaryPages({
  activeThread,
  chatInfoPanel,
  chatMediaPanel,
  chatSearchPanel,
  onSearchResultSelect,
}: ChatAuxiliaryPagesProps) {
  return (
    <>
      {chatInfoPanel.state.isOpen ? (
        <ChatInfoPage
          info={chatInfoPanel.state.info}
          isLoading={chatInfoPanel.state.isLoading}
          onBack={chatInfoPanel.closeChatInfo}
          onRetry={() => {
            void chatInfoPanel.retryChatInfo()
          }}
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
          onBack={chatSearchPanel.closeChatSearch}
          onLoadOlder={() => {
            void chatSearchPanel.loadOlderChatSearch()
          }}
          onQueryChange={(query) => {
            void chatSearchPanel.updateChatSearchQuery(query)
          }}
          onRetry={() => {
            void chatSearchPanel.retryChatSearch()
          }}
          onResultSelect={onSearchResultSelect}
          query={chatSearchPanel.state.query}
          search={chatSearchPanel.state.search}
        />
      ) : null}
    </>
  )
}
