import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from 'react'

import type { ChatMessage, ChatThreadSummary } from '../types'
import { cn } from '../../../shared/lib/cn'
import type { TranscriptScrollSnapshot } from './ChatTranscriptScroll'
import {
  captureTranscriptScrollSnapshot,
  createTranscriptMessageBoundary,
  getTranscriptScrollAction,
} from './ChatTranscriptScroll'
import { DayDivider } from './chat-transcript/DayDivider'
import {
  HistoryFragmentBottomControls,
  HistoryFragmentTopControls,
  LoadOlderMessagesControls,
  type HistoryFragmentControls,
} from './chat-transcript/HistoryControls'
import { MessageBubble } from './chat-transcript/MessageBubble'
import { MessageContextMenu } from './chat-transcript/MessageContextMenu'
import { EmptyTranscriptState } from './chat-transcript/EmptyTranscriptState'
import {
  applyTranscriptScrollAction,
  cancelNextFrame,
  copyTextToClipboard,
  formatMessageDate,
  getContextMenuPosition,
  getMessageBlockPosition,
  getMessageCopyText,
  requestNextFrame,
  restoreFocusToElement,
  shouldRenderDateDivider,
  shouldRenderAuthorName,
  shouldUseDesktopMessageContextMenu,
  type MessageContextMenuState,
} from './chat-transcript/utils'
import {
  useLatestMessagesVisibleReporter,
  type LatestMessagesVisibleBoundary,
} from './useLatestMessagesVisibleReporter'
import { useTranscriptMessageScroll } from './useTranscriptMessageScroll'

type ChatTranscriptProps = {
  activeThreadType?: ChatThreadSummary['type'] | null
  emptyBody?: string
  emptyTitle?: string
  forceScrollToBottomSignal?: number
  historyFragmentControls?: HistoryFragmentControls | null
  hasMoreOlder: boolean
  highlightedMessageId?: number | null
  historyErrorMessage: string | null
  isConnectionAvailable: boolean
  isLoadingOlder: boolean
  isReadOnly?: boolean
  messages: ChatMessage[]
  onLoadOlder: () => void
  onLatestEdgeChange?: (isAtLatestEdge: boolean) => void
  onLatestMessagesVisible?: (boundary: LatestMessagesVisibleBoundary) => void
  onReplyToMessage: (message: ChatMessage) => void
  onRetryTextMessage: (clientMessageKey: string) => void
  scrollToMessageId?: number | null
  scrollToMessageSignal?: number
}

export function ChatTranscript({
  activeThreadType = null,
  emptyBody,
  emptyTitle,
  forceScrollToBottomSignal = 0,
  historyFragmentControls = null,
  hasMoreOlder,
  highlightedMessageId = null,
  historyErrorMessage,
  isConnectionAvailable,
  isLoadingOlder,
  isReadOnly = false,
  messages,
  onLoadOlder,
  onLatestEdgeChange,
  onLatestMessagesVisible,
  onReplyToMessage,
  onRetryTextMessage,
  scrollToMessageId = null,
  scrollToMessageSignal = 0,
}: ChatTranscriptProps) {
  const [contextMenu, setContextMenu] = useState<MessageContextMenuState>(null)
  const [copyStatusText, setCopyStatusText] = useState('')
  const [revealedActionMessageId, setRevealedActionMessageId] = useState<
    number | null
  >(null)
  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  const messageListRef = useRef<HTMLDivElement | null>(null)
  const scrollElementRef = useRef<HTMLElement | null>(null)
  const previousScrollSnapshotRef = useRef<TranscriptScrollSnapshot | null>(
    null,
  )
  const shouldAutoFollowNewMessagesRef = useRef(true)
  const lastForceScrollToBottomSignalRef = useRef(forceScrollToBottomSignal)
  const lastScrollToMessageSignalRef = useRef(scrollToMessageSignal)
  const reportLatestMessagesVisible = useLatestMessagesVisibleReporter({
    hasHistoryFragmentControls: historyFragmentControls !== null,
    messages,
    onLatestMessagesVisible,
  })

  const closeContextMenu = useCallback(
    ({
      restoreFocus = false,
    }: {
      restoreFocus?: boolean
    } = {}) => {
      const returnFocusTo = restoreFocus ? contextMenu?.returnFocusTo : null

      setContextMenu(null)
      restoreFocusToElement(returnFocusTo)
    },
    [contextMenu],
  )

  useEffect(() => {
    if (!contextMenu) {
      return
    }

    function handleDocumentPointerDown(event: globalThis.PointerEvent) {
      const target = event.target

      if (target instanceof Node && contextMenuRef.current?.contains(target)) {
        return
      }

      closeContextMenu()
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeContextMenu({ restoreFocus: true })
      }
    }

    function handleWindowResize() {
      closeContextMenu()
    }

    document.addEventListener('pointerdown', handleDocumentPointerDown)
    document.addEventListener('keydown', handleDocumentKeyDown)
    window.addEventListener('resize', handleWindowResize)

    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown)
      document.removeEventListener('keydown', handleDocumentKeyDown)
      window.removeEventListener('resize', handleWindowResize)
    }
  }, [closeContextMenu, contextMenu])

  useLayoutEffect(() => {
    const scrollElement = scrollElementRef.current

    if (!scrollElement) {
      return
    }

    function captureCurrentScrollSnapshot() {
      if (!scrollElement) {
        return
      }

      const nextSnapshot = captureTranscriptScrollSnapshot(
        scrollElement,
        messages,
      )

      previousScrollSnapshotRef.current = nextSnapshot
      shouldAutoFollowNewMessagesRef.current = nextSnapshot.wasNearBottom
      onLatestEdgeChange?.(nextSnapshot.wasNearBottom)
      reportLatestMessagesVisible(scrollElement)
    }

    const action = getTranscriptScrollAction({
      currentBoundary: createTranscriptMessageBoundary(messages),
      currentScrollHeight: scrollElement.scrollHeight,
      previousSnapshot: previousScrollSnapshotRef.current,
      shouldAutoFollowNewMessages: shouldAutoFollowNewMessagesRef.current,
    })

    applyTranscriptScrollAction(scrollElement, action)

    const frameId = requestNextFrame(() => {
      applyTranscriptScrollAction(scrollElement, action)
      captureCurrentScrollSnapshot()
    })

    captureCurrentScrollSnapshot()

    return () => {
      cancelNextFrame(frameId)
    }
  }, [messages, onLatestEdgeChange, reportLatestMessagesVisible])

  useLayoutEffect(() => {
    if (
      lastForceScrollToBottomSignalRef.current === forceScrollToBottomSignal
    ) {
      return
    }

    const scrollElement = scrollElementRef.current

    if (!scrollElement) {
      return
    }

    lastForceScrollToBottomSignalRef.current = forceScrollToBottomSignal

    function scrollToBottomAndCapture() {
      if (!scrollElement) {
        return
      }

      scrollElement.scrollTop = scrollElement.scrollHeight
      previousScrollSnapshotRef.current = captureTranscriptScrollSnapshot(
        scrollElement,
        messages,
      )
      onLatestEdgeChange?.(previousScrollSnapshotRef.current.wasNearBottom)
      shouldAutoFollowNewMessagesRef.current = true
      reportLatestMessagesVisible(scrollElement)
    }

    scrollToBottomAndCapture()
    const frameId = requestNextFrame(scrollToBottomAndCapture)

    return () => {
      cancelNextFrame(frameId)
    }
  }, [
    forceScrollToBottomSignal,
    messages,
    onLatestEdgeChange,
    reportLatestMessagesVisible,
  ])

  useTranscriptMessageScroll({
    lastScrollToMessageSignalRef,
    messages,
    previousScrollSnapshotRef,
    scrollElementRef,
    scrollToMessageId,
    scrollToMessageSignal,
    shouldAutoFollowNewMessagesRef,
  })

  useEffect(() => {
    function reportCurrentLatestMessagesVisible() {
      const scrollElement = scrollElementRef.current

      if (!scrollElement) {
        return
      }

      reportLatestMessagesVisible(scrollElement)
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') {
        return
      }

      reportCurrentLatestMessagesVisible()
    }

    window.addEventListener('focus', reportCurrentLatestMessagesVisible)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', reportCurrentLatestMessagesVisible)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [reportLatestMessagesVisible])

  useEffect(() => {
    const messageListElement = messageListRef.current
    const scrollElement = scrollElementRef.current

    if (
      !messageListElement ||
      !scrollElement ||
      typeof ResizeObserver === 'undefined'
    ) {
      return
    }

    let frameId: number | null = null

    const observer = new ResizeObserver(() => {
      if (!shouldAutoFollowNewMessagesRef.current) {
        return
      }

      cancelNextFrame(frameId)
      frameId = requestNextFrame(() => {
        scrollElement.scrollTop = scrollElement.scrollHeight
        const nextSnapshot = captureTranscriptScrollSnapshot(
          scrollElement,
          messages,
        )

        previousScrollSnapshotRef.current = nextSnapshot
        shouldAutoFollowNewMessagesRef.current = nextSnapshot.wasNearBottom
        onLatestEdgeChange?.(nextSnapshot.wasNearBottom)
        reportLatestMessagesVisible(scrollElement)
      })
    })

    observer.observe(messageListElement)
    observer.observe(scrollElement)

    return () => {
      cancelNextFrame(frameId)
      observer.disconnect()
    }
  }, [messages, onLatestEdgeChange, reportLatestMessagesVisible])

  function handleTranscriptScroll() {
    const scrollElement = scrollElementRef.current

    if (!scrollElement) {
      return
    }

    if (contextMenu) {
      setContextMenu(null)
    }
    setRevealedActionMessageId(null)

    const nextSnapshot = captureTranscriptScrollSnapshot(
      scrollElement,
      messages,
    )
    shouldAutoFollowNewMessagesRef.current = nextSnapshot.wasNearBottom
    previousScrollSnapshotRef.current = nextSnapshot
    onLatestEdgeChange?.(nextSnapshot.wasNearBottom)
    reportLatestMessagesVisible(scrollElement)
  }

  function handleOpenContextMenu(message: ChatMessage, event: MouseEvent) {
    if (isReadOnly) {
      return
    }

    if (!shouldUseDesktopMessageContextMenu()) {
      return
    }

    event.preventDefault()

    const position = getContextMenuPosition({
      clientX: event.clientX,
      clientY: event.clientY,
    })

    setContextMenu({
      focusOnOpen: false,
      message,
      returnFocusTo: null,
      x: position.x,
      y: position.y,
    })
    setRevealedActionMessageId(message.id)
  }

  function handleOpenActionMenu(
    message: ChatMessage,
    triggerElement: HTMLElement,
  ) {
    if (isReadOnly) {
      return
    }

    const triggerBounds = triggerElement.getBoundingClientRect()
    const position = getContextMenuPosition({
      clientX: triggerBounds.left,
      clientY: triggerBounds.bottom + 8,
    })

    setContextMenu({
      focusOnOpen: true,
      message,
      returnFocusTo: triggerElement,
      x: position.x,
      y: position.y,
    })
    setRevealedActionMessageId(message.id)
  }

  async function handleCopyMessage(message: ChatMessage) {
    const wasCopied = await copyTextToClipboard(getMessageCopyText(message))

    if (wasCopied) {
      setCopyStatusText('Сообщение скопировано.')
      closeContextMenu({ restoreFocus: true })
      window.setTimeout(() => {
        setCopyStatusText('')
      }, 1600)
    }
  }

  return (
    <>
      <div aria-live="polite" className="sr-only">
        {copyStatusText}
      </div>

      <section
        className="chat-scroll flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6"
        onScroll={handleTranscriptScroll}
        ref={scrollElementRef}
      >
        <div
          className="mx-auto flex w-full max-w-[620px] flex-col"
          ref={messageListRef}
        >
          {historyFragmentControls ? (
            <HistoryFragmentTopControls controls={historyFragmentControls} />
          ) : (
            <LoadOlderMessagesControls
              hasMoreOlder={hasMoreOlder}
              historyErrorMessage={historyErrorMessage}
              isConnectionAvailable={isConnectionAvailable}
              isLoadingOlder={isLoadingOlder}
              onLoadOlder={onLoadOlder}
            />
          )}

          {messages.length === 0 ? (
            <EmptyTranscriptState body={emptyBody} title={emptyTitle} />
          ) : null}

          {messages.map((message, index) => {
            const blockPosition = getMessageBlockPosition(messages, index)
            const hasDateDivider = shouldRenderDateDivider(messages, index)
            const showSupportBadge =
              activeThreadType === 'group' &&
              message.authorRole === 'agent' &&
              shouldRenderAuthorName(blockPosition)

            return (
              <div className="contents" key={message.id}>
                {hasDateDivider ? (
                  <DayDivider
                    className={cn(
                      'mb-3',
                      index === 0 && !hasMoreOlder ? '' : 'mt-4',
                    )}
                    label={formatMessageDate(message.createdAt)}
                  />
                ) : null}
                <MessageBubble
                  blockPosition={blockPosition}
                  hasDateDivider={hasDateDivider}
                  index={index}
                  isActionButtonRevealed={
                    revealedActionMessageId === message.id ||
                    contextMenu?.message.id === message.id
                  }
                  isConnectionAvailable={isConnectionAvailable}
                  isHighlighted={highlightedMessageId === message.id}
                  isReadOnly={isReadOnly}
                  message={message}
                  onOpenActionMenu={handleOpenActionMenu}
                  onOpenContextMenu={handleOpenContextMenu}
                  onReplyToMessage={onReplyToMessage}
                  onRevealActionButton={setRevealedActionMessageId}
                  onRetryTextMessage={onRetryTextMessage}
                  showSupportBadge={showSupportBadge}
                />
              </div>
            )
          })}

          {historyFragmentControls ? (
            <HistoryFragmentBottomControls controls={historyFragmentControls} />
          ) : null}
        </div>
      </section>

      {!isReadOnly && contextMenu ? (
        <MessageContextMenu
          menu={contextMenu}
          menuRef={contextMenuRef}
          onClose={closeContextMenu}
          onCopyMessage={(message) => {
            void handleCopyMessage(message)
          }}
          onReplyToMessage={onReplyToMessage}
        />
      ) : null}
    </>
  )
}
