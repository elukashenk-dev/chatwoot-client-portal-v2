import { useEffect, useRef, useState, type RefObject } from 'react'

import { ChatApiClientError, getChatThreadSearch } from '../api/chatClient'
import {
  CHAT_SEARCH_QUERY_MAX_LENGTH,
  mergeChatSearchWithCurrentSnapshot,
  normalizeChatSearchQuery,
} from '../lib/chatSearch'
import type {
  ChatMessagesSnapshot,
  ChatThreadReason,
  ChatThreadSearchResponse,
} from '../types'

export type ChatSearchPanelState = {
  isLoading: boolean
  isLoadingOlder: boolean
  isOpen: boolean
  query: string
  search: ChatThreadSearchResponse | null
}

const unavailableSearch: ChatThreadSearchResponse = {
  activeThread: null,
  hasMoreOlder: false,
  items: [],
  nextOlderCursor: null,
  query: '',
  reason: 'chatwoot_unavailable',
  result: 'unavailable',
}

const CHAT_SEARCH_DEBOUNCE_MS = 300

function normalizeChatSearchInput(query: string) {
  return query.slice(0, CHAT_SEARCH_QUERY_MAX_LENGTH)
}

function readUnavailableReason(error: unknown): ChatThreadReason {
  if (!(error instanceof ChatApiClientError)) {
    return 'chatwoot_unavailable'
  }

  switch (error.code) {
    case 'chatwoot_not_configured':
    case 'chatwoot_unavailable':
    case 'contact_link_missing':
    case 'conversation_mapping_unavailable':
    case 'conversation_missing':
    case 'thread_access_denied':
    case 'thread_invalid':
      return error.code
    default:
      return 'chatwoot_unavailable'
  }
}

type UseChatSearchPanelOptions = {
  currentSnapshot: ChatMessagesSnapshot | null
  handleConnectionUnavailableError: (error: unknown) => boolean
  handleUnauthorizedChatError: (error: unknown) => Promise<boolean>
  isMountedRef: RefObject<boolean>
  markBrowserOnline: () => void
  selectedThreadId: string | null
}

export function useChatSearchPanel({
  currentSnapshot,
  handleConnectionUnavailableError,
  handleUnauthorizedChatError,
  isMountedRef,
  markBrowserOnline,
  selectedThreadId,
}: UseChatSearchPanelOptions) {
  const pendingSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const currentSnapshotRef = useRef(currentSnapshot)
  const requestSequenceRef = useRef(0)
  const [state, setState] = useState<ChatSearchPanelState>({
    isLoading: false,
    isLoadingOlder: false,
    isOpen: false,
    query: '',
    search: null,
  })

  function isCurrentRequest(requestId: number) {
    return isMountedRef.current && requestSequenceRef.current === requestId
  }

  function clearPendingSearchTimer() {
    if (pendingSearchTimerRef.current === null) {
      return
    }

    clearTimeout(pendingSearchTimerRef.current)
    pendingSearchTimerRef.current = null
  }

  async function executeChatSearch({
    displayQuery,
    requestId,
    searchQuery,
    threadId,
  }: {
    displayQuery: string
    requestId: number
    searchQuery: string
    threadId: string
  }) {
    try {
      const search = await getChatThreadSearch({
        beforeMessageId: null,
        query: searchQuery,
        threadId,
      })

      if (!isCurrentRequest(requestId)) {
        return
      }

      markBrowserOnline()
      setState({
        isLoading: false,
        isLoadingOlder: false,
        isOpen: true,
        query: displayQuery,
        search: mergeChatSearchWithCurrentSnapshot({
          currentSnapshot: currentSnapshotRef.current,
          search,
          selectedThreadId: threadId,
        }),
      })
    } catch (error) {
      if (!isCurrentRequest(requestId)) {
        return
      }

      if (await handleUnauthorizedChatError(error)) {
        if (!isCurrentRequest(requestId)) {
          return
        }

        setState({
          isLoading: false,
          isLoadingOlder: false,
          isOpen: true,
          query: displayQuery,
          search: { ...unavailableSearch, query: searchQuery },
        })
        return
      }

      handleConnectionUnavailableError(error)
      if (!isCurrentRequest(requestId)) {
        return
      }

      setState({
        isLoading: false,
        isLoadingOlder: false,
        isOpen: true,
        query: displayQuery,
        search: {
          ...unavailableSearch,
          query: searchQuery,
          reason: readUnavailableReason(error),
        },
      })
    }
  }

  function startChatSearch({
    debounce,
    displayQuery,
    searchQuery,
    threadId,
  }: {
    debounce: boolean
    displayQuery: string
    searchQuery: string
    threadId: string
  }) {
    const requestId = requestSequenceRef.current + 1
    requestSequenceRef.current = requestId
    setState((currentState) => ({
      ...currentState,
      isLoading: true,
      isLoadingOlder: false,
      query: displayQuery,
      search: null,
    }))

    if (!debounce) {
      void executeChatSearch({
        displayQuery,
        requestId,
        searchQuery,
        threadId,
      })
      return
    }

    pendingSearchTimerRef.current = setTimeout(() => {
      pendingSearchTimerRef.current = null
      void executeChatSearch({
        displayQuery,
        requestId,
        searchQuery,
        threadId,
      })
    }, CHAT_SEARCH_DEBOUNCE_MS)
  }

  function updateChatSearchQuery(nextQuery: string) {
    const displayQuery = normalizeChatSearchInput(nextQuery)
    const searchQuery = normalizeChatSearchQuery(displayQuery)

    if (!selectedThreadId) {
      return
    }

    clearPendingSearchTimer()

    if (searchQuery.length < 2) {
      requestSequenceRef.current += 1
      setState((currentState) => ({
        ...currentState,
        isLoading: false,
        isLoadingOlder: false,
        query: displayQuery,
        search: null,
      }))
      return
    }

    startChatSearch({
      debounce: true,
      displayQuery,
      searchQuery,
      threadId: selectedThreadId,
    })
  }

  async function loadOlderChatSearch() {
    const searchQuery = normalizeChatSearchQuery(state.query)

    if (
      !selectedThreadId ||
      state.isLoading ||
      state.isLoadingOlder ||
      !state.search?.nextOlderCursor ||
      searchQuery.length < 2
    ) {
      return
    }

    clearPendingSearchTimer()

    const requestId = requestSequenceRef.current + 1
    const beforeMessageId = state.search.nextOlderCursor
    requestSequenceRef.current = requestId
    setState((currentState) => ({
      ...currentState,
      isLoadingOlder: true,
    }))

    try {
      const olderSearch = await getChatThreadSearch({
        beforeMessageId,
        query: searchQuery,
        threadId: selectedThreadId,
      })

      if (!isCurrentRequest(requestId)) {
        return
      }

      markBrowserOnline()
      setState((currentState) => {
        if (!currentState.search || olderSearch.result !== 'ready') {
          return {
            ...currentState,
            isLoadingOlder: false,
          }
        }

        return {
          ...currentState,
          isLoadingOlder: false,
          search: {
            ...olderSearch,
            items: [...currentState.search.items, ...olderSearch.items],
          },
        }
      })
    } catch (error) {
      if (!isCurrentRequest(requestId)) {
        return
      }

      if (await handleUnauthorizedChatError(error)) {
        if (!isCurrentRequest(requestId)) {
          return
        }
      } else {
        handleConnectionUnavailableError(error)
      }

      if (!isCurrentRequest(requestId)) {
        return
      }

      setState((currentState) => ({
        ...currentState,
        isLoadingOlder: false,
      }))
    }
  }

  useEffect(() => {
    currentSnapshotRef.current = currentSnapshot
  }, [currentSnapshot])

  useEffect(() => {
    return () => {
      if (pendingSearchTimerRef.current !== null) {
        clearTimeout(pendingSearchTimerRef.current)
        pendingSearchTimerRef.current = null
      }

      requestSequenceRef.current += 1
    }
  }, [selectedThreadId])

  return {
    closeChatSearch: () => {
      clearPendingSearchTimer()
      requestSequenceRef.current += 1
      setState((currentState) => ({
        ...currentState,
        isLoading: false,
        isLoadingOlder: false,
        isOpen: false,
      }))
    },
    loadOlderChatSearch,
    openChatSearch: () => {
      clearPendingSearchTimer()
      requestSequenceRef.current += 1
      setState({
        isLoading: false,
        isLoadingOlder: false,
        isOpen: true,
        query: '',
        search: null,
      })
    },
    retryChatSearch: () => {
      const displayQuery = normalizeChatSearchInput(state.query)
      const searchQuery = normalizeChatSearchQuery(displayQuery)

      if (!selectedThreadId || searchQuery.length < 2) {
        return
      }

      clearPendingSearchTimer()
      startChatSearch({
        debounce: false,
        displayQuery,
        searchQuery,
        threadId: selectedThreadId,
      })
    },
    state,
    updateChatSearchQuery,
  }
}
