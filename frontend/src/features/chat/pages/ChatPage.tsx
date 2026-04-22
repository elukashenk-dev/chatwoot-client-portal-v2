import { useCallback, useEffect, useRef, useState } from 'react'

import {
  getChatMessages,
  sendChatAttachment,
  sendChatMessage,
} from '../api/chatClient'
import { openChatRealtime } from '../api/chatRealtimeClient'
import type {
  ChatMessage,
  ChatMessagesSnapshot,
  ChatSendResult,
} from '../types'
import { ChatHeader } from '../components/ChatHeader'
import { ChatLoadingState } from '../components/ChatLoadingState'
import { ChatNotReadyState } from '../components/ChatNotReadyState'
import { ChatTranscript } from '../components/ChatTranscript'
import {
  MessageComposer,
  type MessageComposerReplyTarget,
} from '../components/MessageComposer'

type ChatPageState =
  | {
      status: 'error'
      errorMessage: string
      snapshot: ChatMessagesSnapshot | null
    }
  | {
      status: 'loading'
      snapshot: ChatMessagesSnapshot | null
    }
  | {
      status: 'ready'
      snapshot: ChatMessagesSnapshot
    }

function mergeOlderMessages(
  currentSnapshot: ChatMessagesSnapshot,
  olderSnapshot: ChatMessagesSnapshot,
): ChatMessagesSnapshot {
  const currentIds = new Set(
    currentSnapshot.messages.map((message) => message.id),
  )
  const olderMessages = olderSnapshot.messages.filter(
    (message) => !currentIds.has(message.id),
  )

  return {
    ...olderSnapshot,
    messages: [...olderMessages, ...currentSnapshot.messages],
  }
}

function appendSentMessage(messages: ChatMessage[], sentMessage: ChatMessage) {
  if (messages.some((message) => message.id === sentMessage.id)) {
    return messages
  }

  return [...messages, sentMessage]
}

function sortMessagesByTimeline(messages: ChatMessage[]) {
  return [...messages].sort((left, right) => {
    const leftTime = new Date(left.createdAt).getTime()
    const rightTime = new Date(right.createdAt).getTime()

    if (leftTime !== rightTime) {
      return leftTime - rightTime
    }

    return left.id - right.id
  })
}

function mergeRealtimeSnapshot({
  currentSnapshot,
  realtimeSnapshot,
}: {
  currentSnapshot: ChatMessagesSnapshot
  realtimeSnapshot: ChatMessagesSnapshot
}): ChatMessagesSnapshot {
  if (
    currentSnapshot.result !== 'ready' ||
    !currentSnapshot.primaryConversation ||
    realtimeSnapshot.result !== 'ready' ||
    !realtimeSnapshot.primaryConversation ||
    currentSnapshot.primaryConversation.id !==
      realtimeSnapshot.primaryConversation.id
  ) {
    return realtimeSnapshot
  }

  const messagesById = new Map(
    currentSnapshot.messages.map((message) => [message.id, message]),
  )

  for (const message of realtimeSnapshot.messages) {
    messagesById.set(message.id, message)
  }

  return {
    ...realtimeSnapshot,
    hasMoreOlder: currentSnapshot.hasMoreOlder || realtimeSnapshot.hasMoreOlder,
    messages: sortMessagesByTimeline([...messagesById.values()]),
    nextOlderCursor:
      currentSnapshot.nextOlderCursor ?? realtimeSnapshot.nextOlderCursor,
  }
}

function isFirstConversationBootstrapReady(snapshot: ChatMessagesSnapshot) {
  return (
    snapshot.result === 'not_ready' &&
    snapshot.reason === 'conversation_missing' &&
    snapshot.linkedContact !== null
  )
}

function toComposerReplyTarget(
  message: ChatMessage,
): MessageComposerReplyTarget {
  return {
    attachmentName: message.attachments[0]?.name ?? null,
    authorName: message.authorName,
    content: message.content,
    id: message.id,
  }
}

function buildSnapshotFromSendResult({
  currentSnapshot,
  sendResult,
}: {
  currentSnapshot: ChatMessagesSnapshot | null
  sendResult: ChatSendResult
}): ChatMessagesSnapshot {
  return {
    hasMoreOlder: currentSnapshot?.hasMoreOlder ?? false,
    linkedContact: sendResult.linkedContact,
    messages: sendResult.sentMessage
      ? appendSentMessage(
          currentSnapshot?.messages ?? [],
          sendResult.sentMessage,
        )
      : (currentSnapshot?.messages ?? []),
    nextOlderCursor: currentSnapshot?.nextOlderCursor ?? null,
    primaryConversation: sendResult.primaryConversation,
    reason: sendResult.reason,
    result: sendResult.result,
  }
}

export function ChatPage() {
  const isMountedRef = useRef(false)
  const [pageState, setPageState] = useState<ChatPageState>({
    snapshot: null,
    status: 'loading',
  })
  const [historyErrorMessage, setHistoryErrorMessage] = useState<string | null>(
    null,
  )
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [replyTarget, setReplyTarget] =
    useState<MessageComposerReplyTarget | null>(null)
  const [sendErrorMessage, setSendErrorMessage] = useState<string | null>(null)

  const loadInitialChat = useCallback(async () => {
    setHistoryErrorMessage(null)
    setPageState((currentState) => ({
      snapshot: currentState.snapshot,
      status: 'loading',
    }))

    try {
      const snapshot = await getChatMessages()

      if (!isMountedRef.current) {
        return
      }

      setPageState({
        snapshot,
        status: 'ready',
      })
    } catch (error) {
      if (!isMountedRef.current) {
        return
      }

      setPageState({
        errorMessage:
          error instanceof Error
            ? error.message
            : 'Мы не смогли загрузить чат. Попробуйте еще раз.',
        snapshot: null,
        status: 'error',
      })
    }
  }, [])

  async function handleLoadOlderMessages() {
    if (
      pageState.status !== 'ready' ||
      !pageState.snapshot.primaryConversation ||
      !pageState.snapshot.nextOlderCursor
    ) {
      return
    }

    setIsLoadingOlder(true)
    setHistoryErrorMessage(null)

    try {
      const olderSnapshot = await getChatMessages({
        beforeMessageId: pageState.snapshot.nextOlderCursor,
        primaryConversationId: pageState.snapshot.primaryConversation.id,
      })

      if (!isMountedRef.current) {
        return
      }

      if (olderSnapshot.result !== 'ready') {
        setHistoryErrorMessage(
          'Не удалось загрузить более ранние сообщения. Попробуйте еще раз.',
        )

        return
      }

      setPageState((currentState) => {
        if (currentState.status !== 'ready') {
          return currentState
        }

        return {
          snapshot: mergeOlderMessages(currentState.snapshot, olderSnapshot),
          status: 'ready',
        }
      })
    } catch {
      if (!isMountedRef.current) {
        return
      }

      setHistoryErrorMessage(
        'Не удалось загрузить более ранние сообщения. Попробуйте еще раз.',
      )
    } finally {
      if (isMountedRef.current) {
        setIsLoadingOlder(false)
      }
    }
  }

  async function handleSendMessage({
    clientMessageKey,
    content,
    replyToMessageId,
  }: {
    clientMessageKey: string
    content: string
    replyToMessageId?: number | null
  }) {
    if (pageState.status !== 'ready') {
      return false
    }

    setIsSending(true)
    setSendErrorMessage(null)

    try {
      const sendResult = await sendChatMessage({
        clientMessageKey,
        content,
        primaryConversationId:
          pageState.snapshot.primaryConversation?.id ?? null,
        replyToMessageId,
      })

      if (!isMountedRef.current) {
        return false
      }

      if (sendResult.result !== 'ready' || !sendResult.sentMessage) {
        setSendErrorMessage(
          'Не удалось отправить сообщение. Попробуйте еще раз.',
        )
        return false
      }

      setPageState((currentState) => {
        const currentSnapshot =
          currentState.status === 'ready' ? currentState.snapshot : null

        return {
          snapshot: buildSnapshotFromSendResult({
            currentSnapshot,
            sendResult,
          }),
          status: 'ready',
        }
      })

      return true
    } catch (error) {
      if (!isMountedRef.current) {
        return false
      }

      setSendErrorMessage(
        error instanceof Error
          ? error.message
          : 'Не удалось отправить сообщение. Попробуйте еще раз.',
      )

      return false
    } finally {
      if (isMountedRef.current) {
        setIsSending(false)
      }
    }
  }

  async function handleSendAttachment({
    clientMessageKey,
    file,
    replyToMessageId,
  }: {
    clientMessageKey: string
    file: File
    replyToMessageId?: number | null
  }) {
    if (pageState.status !== 'ready') {
      return false
    }

    setIsSending(true)
    setSendErrorMessage(null)

    try {
      const sendResult = await sendChatAttachment({
        clientMessageKey,
        file,
        primaryConversationId:
          pageState.snapshot.primaryConversation?.id ?? null,
        replyToMessageId,
      })

      if (!isMountedRef.current) {
        return false
      }

      if (sendResult.result !== 'ready' || !sendResult.sentMessage) {
        setSendErrorMessage('Не удалось отправить файл. Попробуйте еще раз.')
        return false
      }

      setPageState((currentState) => {
        const currentSnapshot =
          currentState.status === 'ready' ? currentState.snapshot : null

        return {
          snapshot: buildSnapshotFromSendResult({
            currentSnapshot,
            sendResult,
          }),
          status: 'ready',
        }
      })

      return true
    } catch (error) {
      if (!isMountedRef.current) {
        return false
      }

      setSendErrorMessage(
        error instanceof Error
          ? error.message
          : 'Не удалось отправить файл. Попробуйте еще раз.',
      )

      return false
    } finally {
      if (isMountedRef.current) {
        setIsSending(false)
      }
    }
  }

  useEffect(() => {
    isMountedRef.current = true
    const bootstrapTimerId = window.setTimeout(() => {
      void loadInitialChat()
    }, 0)

    return () => {
      window.clearTimeout(bootstrapTimerId)
      isMountedRef.current = false
    }
  }, [loadInitialChat])

  const snapshot = pageState.snapshot
  const realtimePrimaryConversationId =
    pageState.status === 'ready' &&
    pageState.snapshot.result === 'ready' &&
    pageState.snapshot.primaryConversation
      ? pageState.snapshot.primaryConversation.id
      : null

  useEffect(() => {
    if (!realtimePrimaryConversationId) {
      return
    }

    const realtimeConnection = openChatRealtime({
      onChatState: (realtimeSnapshot) => {
        if (!isMountedRef.current) {
          return
        }

        setPageState({
          snapshot: realtimeSnapshot,
          status: 'ready',
        })
      },
      onMessages: (realtimeSnapshot) => {
        if (!isMountedRef.current) {
          return
        }

        setPageState((currentState) => {
          if (currentState.status !== 'ready') {
            return currentState
          }

          return {
            snapshot: mergeRealtimeSnapshot({
              currentSnapshot: currentState.snapshot,
              realtimeSnapshot,
            }),
            status: 'ready',
          }
        })
      },
      primaryConversationId: realtimePrimaryConversationId,
    })

    return () => {
      realtimeConnection.close()
    }
  }, [realtimePrimaryConversationId])

  const isReady =
    snapshot?.result === 'ready' && Boolean(snapshot.primaryConversation)
  const canSend =
    pageState.status === 'ready' &&
    (isReady || isFirstConversationBootstrapReady(pageState.snapshot))
  const shouldRenderTranscript =
    pageState.status === 'ready' &&
    (pageState.snapshot.result === 'ready' ||
      isFirstConversationBootstrapReady(pageState.snapshot))

  return (
    <>
      <ChatHeader
        conversation={snapshot?.primaryConversation ?? null}
        isReady={isReady}
      />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col bg-transparent">
        {pageState.status === 'loading' ? <ChatLoadingState /> : null}

        {pageState.status === 'error' ? (
          <ChatNotReadyState
            isUnavailable
            onRetry={() => {
              void loadInitialChat()
            }}
            reason={snapshot?.reason ?? 'chatwoot_unavailable'}
          />
        ) : null}

        {pageState.status === 'ready' &&
        pageState.snapshot.result !== 'ready' &&
        !isFirstConversationBootstrapReady(pageState.snapshot) ? (
          <ChatNotReadyState
            isUnavailable={pageState.snapshot.result === 'unavailable'}
            onRetry={() => {
              void loadInitialChat()
            }}
            reason={pageState.snapshot.reason}
          />
        ) : null}

        {shouldRenderTranscript ? (
          <ChatTranscript
            hasMoreOlder={pageState.snapshot.hasMoreOlder}
            historyErrorMessage={historyErrorMessage}
            isLoadingOlder={isLoadingOlder}
            messages={pageState.snapshot.messages}
            onLoadOlder={() => {
              void handleLoadOlderMessages()
            }}
            onReplyToMessage={(message) => {
              setReplyTarget(toComposerReplyTarget(message))
            }}
          />
        ) : null}

        <MessageComposer
          disabled={!canSend}
          errorMessage={sendErrorMessage}
          isSending={isSending}
          onCancelReply={() => {
            setReplyTarget(null)
          }}
          onSend={handleSendMessage}
          onSendAttachment={handleSendAttachment}
          replyTarget={replyTarget}
        />
      </div>
    </>
  )
}
