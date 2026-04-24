import {
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
import { CalendarIcon, ChevronUpIcon } from '../../../shared/ui/icons'
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

type ChatTranscriptProps = {
  hasMoreOlder: boolean
  historyErrorMessage: string | null
  isConnectionAvailable: boolean
  isLoadingOlder: boolean
  messages: ChatMessage[]
  onLoadOlder: () => void
  onReplyToMessage: (message: ChatMessage) => void
  onRetryTextMessage: (clientMessageKey: string) => void
}

function DayDivider({
  className,
  label,
}: {
  className?: string
  label: string
}) {
  return (
    <div
      className={cn(
        'self-center flex w-full max-w-[520px] items-center gap-3 px-1',
        className,
      )}
    >
      <div className="h-px flex-1 bg-slate-200" />
      <span className="rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-[12px] font-medium text-brand-700">
        {label}
      </span>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  )
}

export function ChatTranscript({
  hasMoreOlder,
  historyErrorMessage,
  isConnectionAvailable,
  isLoadingOlder,
  messages,
  onLoadOlder,
  onReplyToMessage,
  onRetryTextMessage,
}: ChatTranscriptProps) {
  const [contextMenu, setContextMenu] = useState<MessageContextMenuState>(null)
  const [copyStatusText, setCopyStatusText] = useState('')
  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  const messageListRef = useRef<HTMLDivElement | null>(null)
  const scrollElementRef = useRef<HTMLElement | null>(null)
  const previousScrollSnapshotRef = useRef<TranscriptScrollSnapshot | null>(
    null,
  )
  const shouldAutoFollowNewMessagesRef = useRef(true)

  useEffect(() => {
    if (!contextMenu) {
      return
    }

    function handleDocumentPointerDown(event: globalThis.PointerEvent) {
      const target = event.target

      if (target instanceof Node && contextMenuRef.current?.contains(target)) {
        return
      }

      setContextMenu(null)
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setContextMenu(null)
      }
    }

    function handleWindowResize() {
      setContextMenu(null)
    }

    document.addEventListener('pointerdown', handleDocumentPointerDown)
    document.addEventListener('keydown', handleDocumentKeyDown)
    window.addEventListener('resize', handleWindowResize)

    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown)
      document.removeEventListener('keydown', handleDocumentKeyDown)
      window.removeEventListener('resize', handleWindowResize)
    }
  }, [contextMenu])

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
      message,
      x: position.x,
      y: position.y,
    })
  }

  async function handleCopyMessage(message: ChatMessage) {
    const wasCopied = await copyTextToClipboard(getMessageCopyText(message))

    if (wasCopied) {
      setCopyStatusText('Сообщение скопировано.')
      setContextMenu(null)
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
      <div className="hidden border-b border-slate-200/70 px-5 py-3 sm:block sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[0.7rem] border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-400"
            disabled
            title="Календарь сообщений будет подключен отдельным slice"
            type="button"
          >
            <CalendarIcon />
            Календарь сообщений
          </button>

          <span className="rounded-full border border-brand-100 bg-brand-50 px-2.5 py-1 text-[12px] font-medium text-brand-700">
            Показаны последние {Math.min(messages.length, 20)} сообщений
          </span>
        </div>
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
          {hasMoreOlder ? (
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
                  isConnectionAvailable={isConnectionAvailable}
                  message={message}
                  onOpenContextMenu={handleOpenContextMenu}
                  onReplyToMessage={onReplyToMessage}
                  onRetryTextMessage={onRetryTextMessage}
                />
              </div>
            )
          })}
        </div>
      </section>

      {contextMenu ? (
        <MessageContextMenu
          menu={contextMenu}
          menuRef={contextMenuRef}
          onClose={() => {
            setContextMenu(null)
          }}
          onCopyMessage={(message) => {
            void handleCopyMessage(message)
          }}
          onReplyToMessage={onReplyToMessage}
        />
      ) : null}
    </>
  )
}
