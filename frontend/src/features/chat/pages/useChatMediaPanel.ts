import { useRef, useState, type RefObject } from 'react'

import { ChatApiClientError, getChatThreadMedia } from '../api/chatClient'
import type {
  ChatMediaCategory,
  ChatMediaItem,
  ChatMessagesSnapshot,
  ChatThreadMediaResponse,
  ChatThreadReason,
} from '../types'

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
  currentSnapshot: ChatMessagesSnapshot | null
  handleConnectionUnavailableError: (error: unknown) => boolean
  handleUnauthorizedChatError: (error: unknown) => Promise<boolean>
  isMountedRef: RefObject<boolean>
  markBrowserOnline: () => void
  selectedThreadId: string | null
}

function getMediaItemCategory(fileType: string): ChatMediaCategory {
  const normalizedFileType = fileType.trim().toLowerCase()

  if (
    normalizedFileType === 'image' ||
    normalizedFileType.startsWith('image/')
  ) {
    return 'image'
  }

  if (
    normalizedFileType === 'video' ||
    normalizedFileType.startsWith('video/')
  ) {
    return 'video'
  }

  if (
    normalizedFileType === 'audio' ||
    normalizedFileType.startsWith('audio/')
  ) {
    return 'audio'
  }

  return 'file'
}

function buildCurrentSnapshotMediaItems({
  currentSnapshot,
  selectedThreadId,
}: {
  currentSnapshot: ChatMessagesSnapshot | null
  selectedThreadId: string
}) {
  if (
    !currentSnapshot ||
    currentSnapshot.result !== 'ready' ||
    currentSnapshot.activeThread?.id !== selectedThreadId
  ) {
    return []
  }

  const items: ChatMediaItem[] = []

  for (const message of currentSnapshot.messages) {
    for (const attachment of message.attachments) {
      items.push({
        attachmentId: attachment.id,
        authorName: message.authorName,
        authorRole: message.authorRole,
        category: getMediaItemCategory(attachment.fileType),
        createdAt: message.createdAt,
        direction: message.direction,
        fileSize: attachment.fileSize,
        fileType: attachment.fileType,
        id: `attachment:${message.id}:${attachment.id}`,
        messageId: message.id,
        name: attachment.name,
        thumbUrl: attachment.thumbUrl,
        url: attachment.url,
      })
    }
  }

  return items
}

function mergeMediaWithCurrentSnapshot({
  currentSnapshot,
  media,
  selectedThreadId,
}: {
  currentSnapshot: ChatMessagesSnapshot | null
  media: ChatThreadMediaResponse
  selectedThreadId: string
}) {
  if (media.result !== 'ready') {
    return media
  }

  const existingItemIds = new Set(media.items.map((item) => item.id))
  const currentSnapshotItems = buildCurrentSnapshotMediaItems({
    currentSnapshot,
    selectedThreadId,
  }).filter((item) => !existingItemIds.has(item.id))

  if (currentSnapshotItems.length === 0) {
    return media
  }

  return {
    ...media,
    items: [...currentSnapshotItems, ...media.items],
  }
}

export function useChatMediaPanel({
  currentSnapshot,
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

      const mergedMedia = mergeMediaWithCurrentSnapshot({
        currentSnapshot,
        media,
        selectedThreadId,
      })

      markBrowserOnline()
      setState({
        isLoading: false,
        isLoadingOlder: false,
        isOpen: true,
        media: mergedMedia,
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
