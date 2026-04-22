import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react'

import type { ChatAttachment, ChatMessage } from '../types'
import { cn } from '../../../shared/lib/cn'
import type {
  TranscriptScrollAction,
  TranscriptScrollSnapshot,
} from './ChatTranscriptScroll'
import {
  captureTranscriptScrollSnapshot,
  createTranscriptMessageBoundary,
  getTranscriptScrollAction,
} from './ChatTranscriptScroll'
import {
  CalendarIcon,
  CheckIcon,
  ChevronUpIcon,
  CopyIcon,
  FileTextIcon,
  ReplyIcon,
} from '../../../shared/ui/icons'

type ChatTranscriptProps = {
  hasMoreOlder: boolean
  historyErrorMessage: string | null
  isLoadingOlder: boolean
  messages: ChatMessage[]
  onLoadOlder: () => void
  onReplyToMessage: (message: ChatMessage) => void
}

type MessageBlockPosition = 'first' | 'last' | 'middle' | 'single'
type SwipeGestureMode = 'idle' | 'pending' | 'horizontal'

type SwipeGesture = {
  mode: SwipeGestureMode
  pointerId: number | null
  startX: number
  startY: number
}

type MessageContextMenuState = {
  message: ChatMessage
  x: number
  y: number
} | null

const EMPTY_SWIPE_GESTURE: SwipeGesture = {
  mode: 'idle',
  pointerId: null,
  startX: 0,
  startY: 0,
}

const MESSAGE_CONTEXT_MENU_HEIGHT_PX = 104
const MESSAGE_CONTEXT_MENU_WIDTH_PX = 184
const MESSAGE_CONTEXT_MENU_VIEWPORT_PADDING_PX = 12
const SWIPE_HORIZONTAL_START_PX = 12
const SWIPE_MAX_OFFSET_PX = 72
const SWIPE_REPLY_TRIGGER_PX = 56
const SWIPE_VERTICAL_CANCEL_PX = 12

function formatMessageDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
  }).format(new Date(value))
}

function formatMessageDayKey(value: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(new Date(value))

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  return year && month && day ? `${year}-${month}-${day}` : ''
}

function formatMessageMetadataTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value))
}

function requestNextFrame(callback: () => void) {
  if (typeof window.requestAnimationFrame !== 'function') {
    callback()
    return null
  }

  return window.requestAnimationFrame(callback)
}

function cancelNextFrame(frameId: number | null) {
  if (frameId !== null && typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(frameId)
  }
}

function clampValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getContextMenuPosition({
  clientX,
  clientY,
}: {
  clientX: number
  clientY: number
}) {
  const maxX =
    window.innerWidth -
    MESSAGE_CONTEXT_MENU_WIDTH_PX -
    MESSAGE_CONTEXT_MENU_VIEWPORT_PADDING_PX
  const maxY =
    window.innerHeight -
    MESSAGE_CONTEXT_MENU_HEIGHT_PX -
    MESSAGE_CONTEXT_MENU_VIEWPORT_PADDING_PX

  return {
    x: clampValue(
      clientX,
      MESSAGE_CONTEXT_MENU_VIEWPORT_PADDING_PX,
      Math.max(MESSAGE_CONTEXT_MENU_VIEWPORT_PADDING_PX, maxX),
    ),
    y: clampValue(
      clientY,
      MESSAGE_CONTEXT_MENU_VIEWPORT_PADDING_PX,
      Math.max(MESSAGE_CONTEXT_MENU_VIEWPORT_PADDING_PX, maxY),
    ),
  }
}

function isInteractiveEventTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'a, button, input, textarea, select, [role="button"], [data-chat-context-menu]',
      ),
    )
  )
}

function shouldUseDesktopMessageContextMenu() {
  return window.matchMedia?.('(pointer: fine)').matches ?? true
}

function getMessageCopyText(message: ChatMessage) {
  const parts: string[] = []
  const content = message.content?.trim()

  if (content) {
    parts.push(content)
  }

  for (const attachment of message.attachments) {
    parts.push(attachment.url || attachment.name)
  }

  return parts.join('\n').trim()
}

async function copyTextToClipboard(text: string) {
  if (!text) {
    return false
  }

  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error('Clipboard API is unavailable.')
    }

    await navigator.clipboard.writeText(text)

    return true
  } catch {
    const textarea = document.createElement('textarea')

    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.left = '-9999px'
    textarea.style.position = 'fixed'
    textarea.style.top = '0'
    document.body.append(textarea)
    textarea.select()

    try {
      return document.execCommand('copy')
    } finally {
      textarea.remove()
    }
  }
}

function applyTranscriptScrollAction(
  element: HTMLElement,
  action: TranscriptScrollAction,
) {
  if (action.type === 'scroll_to_bottom') {
    element.scrollTop = element.scrollHeight
    return
  }

  if (action.type === 'preserve_prepend') {
    element.scrollTop = action.nextScrollTop
  }
}

function areMessagesInSameVisualBlock(
  currentMessage: ChatMessage | null | undefined,
  adjacentMessage: ChatMessage | null | undefined,
) {
  if (!currentMessage || !adjacentMessage) {
    return false
  }

  return (
    currentMessage.direction === adjacentMessage.direction &&
    currentMessage.authorName === adjacentMessage.authorName &&
    formatMessageDayKey(currentMessage.createdAt) ===
      formatMessageDayKey(adjacentMessage.createdAt)
  )
}

function getMessageBlockPosition(
  messages: ChatMessage[],
  index: number,
): MessageBlockPosition {
  const message = messages[index]
  const previousMessage = index > 0 ? messages[index - 1] : null
  const nextMessage = messages[index + 1] ?? null

  const hasPreviousInBlock = areMessagesInSameVisualBlock(
    previousMessage,
    message,
  )
  const hasNextInBlock = areMessagesInSameVisualBlock(message, nextMessage)

  if (!hasPreviousInBlock && !hasNextInBlock) {
    return 'single'
  }

  if (!hasPreviousInBlock) {
    return 'first'
  }

  if (!hasNextInBlock) {
    return 'last'
  }

  return 'middle'
}

function shouldRenderMessageMeta(blockPosition: MessageBlockPosition) {
  return blockPosition === 'last' || blockPosition === 'single'
}

function shouldRenderAuthorName(blockPosition: MessageBlockPosition) {
  return blockPosition === 'first' || blockPosition === 'single'
}

function getBubbleRadiusClass({
  blockPosition,
  isOutgoing,
}: {
  blockPosition: MessageBlockPosition
  isOutgoing: boolean
}) {
  if (blockPosition === 'single') {
    return 'rounded-[0.7rem]'
  }

  if (isOutgoing) {
    if (blockPosition === 'first') {
      return 'rounded-[0.7rem] rounded-br-none'
    }

    if (blockPosition === 'last') {
      return 'rounded-[0.7rem] rounded-tr-none'
    }

    return 'rounded-[0.7rem] rounded-br-none rounded-tr-none'
  }

  if (blockPosition === 'first') {
    return 'rounded-[0.7rem] rounded-bl-none'
  }

  if (blockPosition === 'last') {
    return 'rounded-[0.7rem] rounded-tl-none'
  }

  return 'rounded-[0.7rem] rounded-bl-none rounded-tl-none'
}

function getMessageWrapperSpacingClass({
  blockPosition,
  hasDateDivider,
  index,
}: {
  blockPosition: MessageBlockPosition
  hasDateDivider: boolean
  index: number
}) {
  if (index === 0 || hasDateDivider) {
    return ''
  }

  return blockPosition === 'first' || blockPosition === 'single'
    ? 'mt-4'
    : 'mt-2'
}

function MessageMeta({ message }: { message: ChatMessage }) {
  const isOutgoing = message.direction === 'outgoing'

  return (
    <div
      className={
        isOutgoing
          ? 'mt-2 flex items-center justify-end gap-1 text-[12px] leading-none text-white/75'
          : 'mt-2 flex items-center justify-start text-[12px] leading-none text-slate-400'
      }
    >
      <span className="font-medium tabular-nums">
        {formatMessageMetadataTimestamp(message.createdAt)}
      </span>
      {isOutgoing ? <CheckIcon className="h-3.5 w-3.5 text-white/75" /> : null}
    </div>
  )
}

function formatAttachmentSize(value: number | null) {
  if (!value) {
    return 'Размер неизвестен'
  }

  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} МБ`
  }

  return `${Math.max(1, Math.round(value / 1024))} КБ`
}

function AttachmentCard({ attachment }: { attachment: ChatAttachment }) {
  return (
    <a
      className="mt-2 flex items-start gap-3 rounded-[0.7rem] border border-slate-200 bg-white/80 px-3 py-3 text-left transition hover:border-brand-200 hover:bg-white"
      href={attachment.url || undefined}
      rel="noreferrer"
      target="_blank"
    >
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.75rem] bg-white text-brand-800 shadow-sm">
        <FileTextIcon />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-medium text-slate-800">
          {attachment.name}
        </span>
        <span className="mt-0.5 block text-[12px] text-slate-500">
          {attachment.fileType.toUpperCase()} ·{' '}
          {formatAttachmentSize(attachment.fileSize)}
        </span>
      </span>
    </a>
  )
}

function getReplyPreviewText(message: ChatMessage['replyTo']) {
  return (
    message?.content?.trim() ||
    message?.attachmentName ||
    'Сообщение недоступно'
  )
}

function ReplyQuote({
  isOutgoing,
  replyTo,
}: {
  isOutgoing: boolean
  replyTo: NonNullable<ChatMessage['replyTo']>
}) {
  return (
    <div
      className={
        isOutgoing
          ? 'mb-3 rounded-[0.8rem] border border-white/10 bg-white/10 px-3 py-2 text-[13px] leading-5 text-white/85'
          : 'mb-3 rounded-[0.8rem] border border-slate-200 bg-slate-50/90 px-3 py-2 text-[13px] leading-5 text-slate-500'
      }
    >
      <div
        className={
          isOutgoing
            ? 'mb-1 font-medium text-white'
            : 'mb-1 font-medium text-brand-800'
        }
      >
        Ответ на сообщение {replyTo.authorName}
      </div>
      <div className="line-clamp-2">{getReplyPreviewText(replyTo)}</div>
    </div>
  )
}

function SwipeReplyIndicator({ swipeOffset }: { swipeOffset: number }) {
  const isReady = swipeOffset >= SWIPE_REPLY_TRIGGER_PX

  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute right-0 top-1/2 z-0 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border shadow-sm transition',
        swipeOffset > 0 ? 'opacity-100' : 'opacity-0',
        isReady
          ? 'border-brand-800 bg-brand-800 text-white'
          : 'border-brand-100 bg-white text-brand-800',
      )}
    >
      <ReplyIcon className="h-4 w-4" />
    </div>
  )
}

function MessageContextMenu({
  menu,
  menuRef,
  onClose,
  onCopyMessage,
  onReplyToMessage,
}: {
  menu: NonNullable<MessageContextMenuState>
  menuRef: RefObject<HTMLDivElement | null>
  onClose: () => void
  onCopyMessage: (message: ChatMessage) => void
  onReplyToMessage: (message: ChatMessage) => void
}) {
  const copyText = getMessageCopyText(menu.message)

  return (
    <div
      className="fixed z-50 w-[184px] rounded-[0.8rem] border border-slate-200 bg-white p-1.5 text-[14px] font-medium text-slate-700 shadow-xl shadow-slate-900/10"
      data-chat-context-menu
      ref={menuRef}
      role="menu"
      style={{
        left: menu.x,
        top: menu.y,
      }}
    >
      <button
        className="flex min-h-10 w-full items-center gap-2 rounded-[0.65rem] px-3 text-left transition hover:bg-brand-50 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
        onClick={() => {
          onReplyToMessage(menu.message)
          onClose()
        }}
        role="menuitem"
        type="button"
      >
        <ReplyIcon className="h-4 w-4" />
        Ответить
      </button>
      <button
        className="flex min-h-10 w-full items-center gap-2 rounded-[0.65rem] px-3 text-left transition hover:bg-brand-50 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
        disabled={!copyText}
        onClick={() => {
          onCopyMessage(menu.message)
        }}
        role="menuitem"
        type="button"
      >
        <CopyIcon className="h-4 w-4" />
        Копировать
      </button>
    </div>
  )
}

function MessageBubble({
  blockPosition,
  hasDateDivider,
  index,
  message,
  onOpenContextMenu,
  onReplyToMessage,
}: {
  blockPosition: MessageBlockPosition
  hasDateDivider: boolean
  index: number
  message: ChatMessage
  onOpenContextMenu: (message: ChatMessage, event: MouseEvent) => void
  onReplyToMessage: (message: ChatMessage) => void
}) {
  const isOutgoing = message.direction === 'outgoing'
  const [isSwipeActive, setIsSwipeActive] = useState(false)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const swipeGestureRef = useRef<SwipeGesture>(EMPTY_SWIPE_GESTURE)
  const swipeOffsetRef = useRef(0)
  const shouldRenderMeta = shouldRenderMessageMeta(blockPosition)
  const radiusClassName = getBubbleRadiusClass({
    blockPosition,
    isOutgoing,
  })

  function setCurrentSwipeOffset(nextSwipeOffset: number) {
    const clampedOffset = clampValue(nextSwipeOffset, 0, SWIPE_MAX_OFFSET_PX)

    swipeOffsetRef.current = clampedOffset
    setSwipeOffset(clampedOffset)
  }

  function resetSwipeGesture(element?: HTMLElement | null) {
    const pointerId = swipeGestureRef.current.pointerId

    if (
      element &&
      pointerId !== null &&
      typeof element.releasePointerCapture === 'function' &&
      typeof element.hasPointerCapture === 'function' &&
      element.hasPointerCapture(pointerId)
    ) {
      element.releasePointerCapture(pointerId)
    }

    swipeGestureRef.current = EMPTY_SWIPE_GESTURE
    setIsSwipeActive(false)
    setCurrentSwipeOffset(0)
  }

  function handleSwipePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (
      event.pointerType === 'mouse' ||
      event.button !== 0 ||
      isInteractiveEventTarget(event.target)
    ) {
      return
    }

    swipeGestureRef.current = {
      mode: 'pending',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    }
    setIsSwipeActive(true)
  }

  function handleSwipePointerMove(event: PointerEvent<HTMLDivElement>) {
    const gesture = swipeGestureRef.current

    if (
      gesture.mode === 'idle' ||
      gesture.pointerId === null ||
      gesture.pointerId !== event.pointerId
    ) {
      return
    }

    const deltaX = event.clientX - gesture.startX
    const deltaY = event.clientY - gesture.startY
    const absoluteDeltaX = Math.abs(deltaX)
    const absoluteDeltaY = Math.abs(deltaY)

    if (gesture.mode === 'pending') {
      if (
        absoluteDeltaY > SWIPE_VERTICAL_CANCEL_PX &&
        absoluteDeltaY > absoluteDeltaX + 6
      ) {
        resetSwipeGesture(event.currentTarget)
        return
      }

      if (
        deltaX < -SWIPE_HORIZONTAL_START_PX &&
        absoluteDeltaX > absoluteDeltaY + 8
      ) {
        swipeGestureRef.current = {
          ...gesture,
          mode: 'horizontal',
        }

        if (typeof event.currentTarget.setPointerCapture === 'function') {
          event.currentTarget.setPointerCapture(event.pointerId)
        }
      } else {
        return
      }
    }

    event.preventDefault()
    setCurrentSwipeOffset(-deltaX)
  }

  function handleSwipePointerEnd(event: PointerEvent<HTMLDivElement>) {
    const gesture = swipeGestureRef.current
    const shouldTriggerReply =
      gesture.mode === 'horizontal' &&
      gesture.pointerId === event.pointerId &&
      swipeOffsetRef.current >= SWIPE_REPLY_TRIGGER_PX

    resetSwipeGesture(event.currentTarget)

    if (shouldTriggerReply) {
      onReplyToMessage(message)
    }
  }

  function handleSwipePointerCancel(event: PointerEvent<HTMLDivElement>) {
    resetSwipeGesture(event.currentTarget)
  }

  return (
    <div
      className={[
        'flex items-end',
        isOutgoing ? 'justify-end' : 'justify-start',
        getMessageWrapperSpacingClass({
          blockPosition,
          hasDateDivider,
          index,
        }),
      ]
        .filter(Boolean)
        .join(' ')}
      data-message-id={message.id}
    >
      <div className="relative min-w-0 max-w-[86%] sm:max-w-[78%]">
        <SwipeReplyIndicator swipeOffset={swipeOffset} />
        <div
          className={cn(
            'relative z-10 min-w-0',
            isSwipeActive
              ? 'select-none transition-none'
              : 'transition-transform duration-150 ease-out',
          )}
          data-message-swipe-surface
          onContextMenu={(event) => {
            if (isInteractiveEventTarget(event.target)) {
              return
            }

            onOpenContextMenu(message, event)
          }}
          onPointerCancel={handleSwipePointerCancel}
          onPointerDown={handleSwipePointerDown}
          onPointerMove={handleSwipePointerMove}
          onPointerUp={handleSwipePointerEnd}
          style={{
            touchAction: 'pan-y',
            transform:
              swipeOffset > 0 ? `translateX(-${swipeOffset}px)` : undefined,
          }}
        >
          {shouldRenderAuthorName(blockPosition) ? (
            <div
              className={cn(
                'mb-1 flex px-1 text-[12px] font-medium text-slate-700',
                isOutgoing ? 'justify-end' : 'justify-start',
              )}
            >
              {message.authorName}
            </div>
          ) : null}
          <div
            data-chat-bubble
            className={
              isOutgoing
                ? `${radiusClassName} bg-brand-800 px-4 py-3 text-[15px] leading-7 text-white shadow-sm`
                : `${radiusClassName} border border-slate-200 bg-white px-4 py-3 text-[15px] leading-7 text-slate-700 shadow-sm`
            }
          >
            {message.replyTo ? (
              <ReplyQuote isOutgoing={isOutgoing} replyTo={message.replyTo} />
            ) : null}
            {message.content ? (
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : null}
            {message.attachments.map((attachment) => (
              <AttachmentCard attachment={attachment} key={attachment.id} />
            ))}
            {shouldRenderMeta ? <MessageMeta message={message} /> : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function shouldRenderDateDivider(messages: ChatMessage[], index: number) {
  const message = messages[index]
  const previousMessage = index > 0 ? messages[index - 1] : null

  if (!message) {
    return false
  }

  if (!previousMessage) {
    return true
  }

  return (
    formatMessageDate(message.createdAt) !==
    formatMessageDate(previousMessage.createdAt)
  )
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
  isLoadingOlder,
  messages,
  onLoadOlder,
  onReplyToMessage,
}: ChatTranscriptProps) {
  const [contextMenu, setContextMenu] = useState<MessageContextMenuState>(null)
  const [copyStatusText, setCopyStatusText] = useState('')
  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  const scrollElementRef = useRef<HTMLElement | null>(null)
  const previousScrollSnapshotRef = useRef<TranscriptScrollSnapshot | null>(
    null,
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

    const action = getTranscriptScrollAction({
      currentBoundary: createTranscriptMessageBoundary(messages),
      currentScrollHeight: scrollElement.scrollHeight,
      previousSnapshot: previousScrollSnapshotRef.current,
    })

    applyTranscriptScrollAction(scrollElement, action)

    const frameId = requestNextFrame(() => {
      applyTranscriptScrollAction(scrollElement, action)
      previousScrollSnapshotRef.current = captureTranscriptScrollSnapshot(
        scrollElement,
        messages,
      )
    })

    previousScrollSnapshotRef.current = captureTranscriptScrollSnapshot(
      scrollElement,
      messages,
    )

    return () => {
      cancelNextFrame(frameId)
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
      <div className="border-b border-slate-200/70 px-5 py-3 sm:px-6">
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
        <div className="mx-auto flex w-full max-w-[620px] flex-col">
          {hasMoreOlder ? (
            <div className="flex flex-col items-center gap-2 self-center">
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-600 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-wait disabled:text-slate-300"
                disabled={isLoadingOlder}
                onClick={onLoadOlder}
                type="button"
              >
                <ChevronUpIcon className="h-[15px] w-[15px]" />
                {isLoadingOlder
                  ? 'Загружаем...'
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
                  message={message}
                  onOpenContextMenu={handleOpenContextMenu}
                  onReplyToMessage={onReplyToMessage}
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
