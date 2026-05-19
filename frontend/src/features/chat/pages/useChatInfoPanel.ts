import { useRef, useState, type RefObject } from 'react'

import { ChatApiClientError, getChatThreadInfo } from '../api/chatClient'
import type { ChatThreadInfoResponse, ChatThreadReason } from '../types'

export type ChatInfoPanelState = {
  info: ChatThreadInfoResponse | null
  isLoading: boolean
  isOpen: boolean
}

const unavailableInfo: ChatThreadInfoResponse = {
  accessLabel: '',
  activeThread: null,
  curatorName: null,
  lastActivityAt: null,
  participants: [],
  reason: 'chatwoot_unavailable',
  result: 'unavailable',
  startedAt: null,
  supportLabel: 'Команда поддержки',
  threadTypeLabel: null,
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

type UseChatInfoPanelOptions = {
  handleConnectionUnavailableError: (error: unknown) => boolean
  handleUnauthorizedChatError: (error: unknown) => Promise<boolean>
  isMountedRef: RefObject<boolean>
  markBrowserOnline: () => void
  selectedThreadId: string | null
}

export function useChatInfoPanel({
  handleConnectionUnavailableError,
  handleUnauthorizedChatError,
  isMountedRef,
  markBrowserOnline,
  selectedThreadId,
}: UseChatInfoPanelOptions) {
  const requestSequenceRef = useRef(0)
  const [state, setState] = useState<ChatInfoPanelState>({
    info: null,
    isLoading: false,
    isOpen: false,
  })

  function isCurrentRequest(requestId: number) {
    return isMountedRef.current && requestSequenceRef.current === requestId
  }

  async function loadChatInfo() {
    if (!selectedThreadId) {
      return
    }

    const requestId = requestSequenceRef.current + 1
    requestSequenceRef.current = requestId
    setState({ info: null, isLoading: true, isOpen: true })

    try {
      const info = await getChatThreadInfo(selectedThreadId)

      if (!isCurrentRequest(requestId)) {
        return
      }

      markBrowserOnline()
      setState({ info, isLoading: false, isOpen: true })
    } catch (error) {
      if (!isCurrentRequest(requestId)) {
        return
      }

      if (await handleUnauthorizedChatError(error)) {
        if (!isCurrentRequest(requestId)) {
          return
        }

        setState({
          info: unavailableInfo,
          isLoading: false,
          isOpen: true,
        })
        return
      }

      handleConnectionUnavailableError(error)
      if (!isCurrentRequest(requestId)) {
        return
      }

      setState({
        info: { ...unavailableInfo, reason: readUnavailableReason(error) },
        isLoading: false,
        isOpen: true,
      })
    }
  }

  return {
    closeChatInfo: () => {
      requestSequenceRef.current += 1
      setState((currentState) => ({
        ...currentState,
        isOpen: false,
      }))
    },
    loadChatInfo,
    retryChatInfo: loadChatInfo,
    state,
  }
}
