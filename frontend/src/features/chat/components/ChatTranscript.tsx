import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from 'react'

import type { ChatMessage } from '../types'
import { cn } from '../../../shared/lib/cn'
import type { TranscriptScrollSnapshot } from './ChatTranscriptScroll'
import {
  captureTranscriptScrollSnapshot,
  createTranscriptMessageBoundary,
  getTranscriptScrollAction,
  isTranscriptNearBottom,
} from './ChatTranscriptScroll'
import { ChevronUpIcon } from '../../../shared/ui/icons'
import { DayDivider } from './chat-transcript/DayDivider'
import { MessageBubble } from './chat-transcript/MessageBubble'
import { MessageContextMenu } from './chat-transcript/MessageContextMenu'
import {
  applyTranscriptScrollAction,
  cancelNextFrame,
  copyTextToClipboard,
  formatMessageDate,
  getContextMenuPosition,
  getMessageBlockPosition,
  getMessageCopyText,
  requestNextFrame,
  shouldRenderDateDivider,
  shouldUseDesktopMessageContextMenu,
  type MessageContextMenuState,
} from './chat-transcript/utils'
import { useTranscriptMessageScroll } from './useTranscriptMessageScroll'

type ChatTranscriptProps = {
  forceScrollToBottomSignal?: number
  historyFragmentControls?: {
    errorMessage: string | null
    hasMoreEarlier: boolean
    hasMoreLater: boolean
    isLoadingEarlier: boolean
    isLoadingLater: boolean
    onLoadEarlier: () => void
    onLoadLater: () => void
    onReturnToLatest: () => void
  } | null
  hasMoreOlder: boolean
  highlightedMessageId?: number | null
  historyErrorMessage: string | null
  isConnectionAvailable: boolean
  isLoadingOlder: boolean
  messages: ChatMessage[]
  onLoadOlder: () => void
  onReplyToMessage: (message: ChatMessage) => void
  onRetryTextMessage: (clientMessageKey: string) => void
  scrollToMessageId?: number | null
  scrollToMessageSignal?: number
}

function restoreFocusToElement(element: HTMLElement | null | undefined) {
  if (element && document.contains(element)) {
    element.focus({ preventScroll: true })
  }
}

export function ChatTranscript({
  forceScrollToBottomSignal = 0,
  historyFragmentControls = null,
  hasMoreOlder,
  highlightedMessageId = null,
  historyErrorMessage,
  isConnectionAvailable,
  isLoadingOlder,
  messages,
  onLoadOlder,
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
  }, [messages])

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
      shouldAutoFollowNewMessagesRef.current = true
    }

    scrollToBottomAndCapture()
    const frameId = requestNextFrame(scrollToBottomAndCapture)

    return () => {
      cancelNextFrame(frameId)
    }
  }, [forceScrollToBottomSignal, messages])

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
      })
    })

    observer.observe(messageListElement)

    return () => {
      cancelNextFrame(frameId)
      observer.disconnect()
    }
  }, [messages])

  function handleTranscriptScroll() {
    const scrollElement = scrollElementRef.current

    if (!scrollElement) {
      return
    }

    if (contextMenu) {
      setContextMenu(null)
    }
    setRevealedActionMessageId(null)

    shouldAutoFollowNewMessagesRef.current =
      isTranscriptNearBottom(scrollElement)
    previousScrollSnapshotRef.current = captureTranscriptScrollSnapshot(
      scrollElement,
      messages,
    )
  }

  function handleOpenContextMenu(message: ChatMessage, event: MouseEvent) {
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
            <div className="mb-3 grid gap-2 self-stretch">
              <div className="rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-[12px] leading-5 text-brand-900">
                <strong className="block text-[13px]">
                  Показан фрагмент истории
                </strong>
                Найденное сообщение открыто в контексте переписки.
              </div>
              {historyFragmentControls.hasMoreEarlier ? (
                <button
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-700 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-wait disabled:text-slate-300"
                  disabled={historyFragmentControls.isLoadingEarlier}
                  onClick={historyFragmentControls.onLoadEarlier}
                  type="button"
                >
                  {historyFragmentControls.isLoadingEarlier
                    ? 'Загружаем...'
                    : 'Показать более ранние'}
                </button>
              ) : null}
              {historyFragmentControls.errorMessage ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[12px] leading-5 text-amber-800">
                  {historyFragmentControls.errorMessage}
                </div>
              ) : null}
            </div>
          ) : hasMoreOlder ? (
            <div className="flex flex-col items-center gap-2 self-center">
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-600 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-wait disabled:text-slate-300"
                disabled={isLoadingOlder || !isConnectionAvailable}
                onClick={onLoadOlder}
                type="button"
              >
                <ChevronUpIcon className="h-[15px] w-[15px]" />
                {isLoadingOlder
                  ? 'Загружаем...'
                  : !isConnectionAvailable
                    ? 'Нет сети'
                    : 'Загрузить более ранние сообщения'}
              </button>
              {historyErrorMessage ? (
                <div className="max-w-[340px] rounded-[0.8rem] border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[12px] leading-5 text-amber-800">
                  {historyErrorMessage}
                </div>
              ) : null}
            </div>
          ) : null}

          {messages.length === 0 ? (
            <div className="rounded-[1rem] border border-dashed border-slate-200 bg-slate-50/80 px-5 py-8 text-center text-[14px] leading-6 text-slate-500">
              В этой переписке пока нет сообщений, доступных клиентскому
              порталу.
            </div>
          ) : null}

          {messages.map((message, index) => {
            const blockPosition = getMessageBlockPosition(messages, index)
            const hasDateDivider = shouldRenderDateDivider(messages, index)

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
                  message={message}
                  onOpenActionMenu={handleOpenActionMenu}
                  onOpenContextMenu={handleOpenContextMenu}
                  onReplyToMessage={onReplyToMessage}
                  onRevealActionButton={setRevealedActionMessageId}
                  onRetryTextMessage={onRetryTextMessage}
                />
              </div>
            )
          })}

          {historyFragmentControls ? (
            <div className="mt-4 grid gap-2 self-stretch">
              {historyFragmentControls.hasMoreLater ? (
                <button
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-700 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-wait disabled:text-slate-300"
                  disabled={historyFragmentControls.isLoadingLater}
                  onClick={historyFragmentControls.onLoadLater}
                  type="button"
                >
                  {historyFragmentControls.isLoadingLater
                    ? 'Загружаем...'
                    : 'Показать более поздние'}
                </button>
              ) : null}
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-900 px-4 text-[13px] font-semibold text-white transition hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
                onClick={historyFragmentControls.onReturnToLatest}
                type="button"
              >
                К последним сообщениям
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {contextMenu ? (
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
