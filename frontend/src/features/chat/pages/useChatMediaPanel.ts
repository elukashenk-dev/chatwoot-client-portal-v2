import { useRef, useState, type RefObject } from 'react'

import { ChatApiClientError, getChatThreadMedia } from '../api/chatClient'
import type { ChatThreadMediaResponse, ChatThreadReason } from '../types'

export type ChatMediaPanelState = {
  isLoading: boolean
  isLoadingOlder: boolean
  isOpen: boolean
  media: ChatThreadMediaResponse | null
}

const unavailableMedia: ChatThreadMediaResponse = {
  activeThread: null,
  hasMoreOlder: false,
  items: [],
  nextOlderCursor: null,
  reason: 'chatwoot_unavailable',
  result: 'unavailable',
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

type UseChatMediaPanelOptions = {
  handleConnectionUnavailableError: (error: unknown) => boolean
  handleUnauthorizedChatError: (error: unknown) => Promise<boolean>
  isMountedRef: RefObject<boolean>
  markBrowserOnline: () => void
  selectedThreadId: string | null
}

export function useChatMediaPanel({
  handleConnectionUnavailableError,
  handleUnauthorizedChatError,
  isMountedRef,
  markBrowserOnline,
  selectedThreadId,
}: UseChatMediaPanelOptions) {
  const requestSequenceRef = useRef(0)
  const [state, setState] = useState<ChatMediaPanelState>({
    isLoading: false,
    isLoadingOlder: false,
    isOpen: false,
    media: null,
  })

  function isCurrentRequest(requestId: number) {
    return isMountedRef.current && requestSequenceRef.current === requestId
  }

  async function loadChatMedia() {
    if (!selectedThreadId) {
      return
    }

    const requestId = requestSequenceRef.current + 1
    requestSequenceRef.current = requestId
    setState({
      isLoading: true,
      isLoadingOlder: false,
      isOpen: true,
      media: null,
    })

    try {
      const media = await getChatThreadMedia({
        beforeMessageId: null,
        threadId: selectedThreadId,
      })

      if (!isCurrentRequest(requestId)) {
        return
      }

      markBrowserOnline()
      setState({
        isLoading: false,
        isLoadingOlder: false,
        isOpen: true,
        media,
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
          media: unavailableMedia,
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
        media: { ...unavailableMedia, reason: readUnavailableReason(error) },
      })
    }
  }

  async function loadOlderChatMedia() {
    if (
      !selectedThreadId ||
      state.isLoading ||
      state.isLoadingOlder ||
      !state.media?.nextOlderCursor
    ) {
      return
    }

    const requestId = requestSequenceRef.current + 1
    const beforeMessageId = state.media.nextOlderCursor
    requestSequenceRef.current = requestId
    setState((currentState) => ({
      ...currentState,
      isLoadingOlder: true,
    }))

    try {
      const olderMedia = await getChatThreadMedia({
        beforeMessageId,
        threadId: selectedThreadId,
      })

      if (!isCurrentRequest(requestId)) {
        return
      }

      markBrowserOnline()
      setState((currentState) => {
        if (!currentState.media || olderMedia.result !== 'ready') {
          return {
            ...currentState,
            isLoadingOlder: false,
          }
        }

        return {
          ...currentState,
          isLoadingOlder: false,
          media: {
            ...olderMedia,
            items: [...currentState.media.items, ...olderMedia.items],
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

        setState((currentState) => ({
          ...currentState,
          isLoadingOlder: false,
        }))
        return
      }

      handleConnectionUnavailableError(error)
      if (!isCurrentRequest(requestId)) {
        return
      }

      setState((currentState) => ({
        ...currentState,
        isLoadingOlder: false,
      }))
    }
  }

  return {
    closeChatMedia: () => {
      requestSequenceRef.current += 1
      setState((currentState) => ({
        ...currentState,
        isLoading: false,
        isLoadingOlder: false,
        isOpen: false,
      }))
    },
    loadChatMedia,
    loadOlderChatMedia,
    retryChatMedia: loadChatMedia,
    state,
  }
}
