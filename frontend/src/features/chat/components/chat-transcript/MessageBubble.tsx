import { useRef, useState, type MouseEvent, type PointerEvent } from 'react'

import { cn } from '../../../../shared/lib/cn'
import {
  CheckIcon,
  ClockIcon,
  RefreshIcon,
  ReplyIcon,
} from '../../../../shared/ui/icons'
import type { ChatMessage } from '../../types'

import { AttachmentCard } from './AttachmentCard'
import { ReplyQuote } from './ReplyQuote'
import {
  formatMessageMetadataTimestamp,
  getAuthorInitials,
  getBubbleRadiusClass,
  getMessageWrapperSpacingClass,
  isInteractiveEventTarget,
  shouldRenderAuthorName,
  type MessageBlockPosition,
} from './utils'

type SwipeGestureMode = 'idle' | 'pending' | 'horizontal'

type SwipeGesture = {
  mode: SwipeGestureMode
  pointerId: number | null
  startX: number
  startY: number
}

type MessageBubbleProps = {
  blockPosition: MessageBlockPosition
  hasDateDivider: boolean
  index: number
  isConnectionAvailable: boolean
  message: ChatMessage
  onOpenContextMenu: (message: ChatMessage, event: MouseEvent) => void
  onReplyToMessage: (message: ChatMessage) => void
  onRetryTextMessage: (clientMessageKey: string) => void
  shouldRenderHeader: boolean
  shouldRenderMeta: boolean
}

const EMPTY_SWIPE_GESTURE: SwipeGesture = {
  mode: 'idle',
  pointerId: null,
  startX: 0,
  startY: 0,
}

const SWIPE_HORIZONTAL_START_PX = 12
const SWIPE_MAX_OFFSET_PX = 72
const SWIPE_REPLY_TRIGGER_PX = 56
const SWIPE_VERTICAL_CANCEL_PX = 12

function clampValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function isLocalTextSend(message: ChatMessage) {
  return (
    message.direction === 'outgoing' &&
    message.attachments.length === 0 &&
    Boolean(message.clientMessageKey) &&
    (message.status === 'sending' || message.status === 'failed')
  )
}

function MessageHeader({ message }: { message: ChatMessage }) {
  const isOutgoing = message.direction === 'outgoing'
  const timestamp = formatMessageMetadataTimestamp(message.createdAt)

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-1 text-[12px] leading-none',
        isOutgoing ? 'mb-1 justify-end' : 'mb-[7px] justify-start',
      )}
      data-message-header
    >
      {isOutgoing ? (
        <>
          <span className="font-normal tabular-nums text-slate-400">
            {timestamp}
          </span>
          <span className="font-medium text-slate-700">
            {message.authorName}
          </span>
        </>
      ) : (
        <>
          <span className="font-medium text-slate-700">
            {message.authorName}
          </span>
          <span className="font-normal tabular-nums text-slate-400">
            {timestamp}
          </span>
        </>
      )}
    </div>
  )
}

function MessageMeta({ message }: { message: ChatMessage }) {
  const isOutgoing = message.direction === 'outgoing'

  if (!isOutgoing) {
    return null
  }

  const isSending = message.status === 'sending'
  const isFailed = message.status === 'failed'
  const statusLabel = isSending
    ? 'Отправка'
    : isFailed
      ? 'Не отправлено'
      : 'Доставлено'
  const statusToneClass = isFailed ? 'text-rose-500' : 'text-slate-400'

  return (
    <div
      className={cn(
        'mt-1.5 flex items-center justify-end gap-1.5 px-1 text-[12px] leading-none',
        statusToneClass,
      )}
      data-message-meta
    >
      {isSending ? (
        <ClockIcon className="h-3.5 w-3.5 shrink-0 animate-pulse" />
      ) : (
        <CheckIcon className="h-3.5 w-3.5 shrink-0" />
      )}
      <span>{statusLabel}</span>
    </div>
  )
}

function RetryTextSend({
  isConnectionAvailable,
  message,
  onRetryTextMessage,
}: {
  isConnectionAvailable: boolean
  message: ChatMessage
  onRetryTextMessage: (clientMessageKey: string) => void
}) {
  if (
    message.status !== 'failed' ||
    !message.clientMessageKey ||
    message.attachments.length > 0
  ) {
    return null
  }

  return (
    <div className="mt-2 flex justify-end">
      <button
        className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 text-[12px] font-medium text-rose-700 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-300"
        disabled={!isConnectionAvailable}
        onClick={() => {
          if (message.clientMessageKey) {
            onRetryTextMessage(message.clientMessageKey)
          }
        }}
        type="button"
      >
        <RefreshIcon className="h-3.5 w-3.5" />
        {isConnectionAvailable ? 'Повторить' : 'Нет сети'}
      </button>
    </div>
  )
}

function AgentAvatar({
  avatarUrl,
  authorName,
  isVisible,
}: {
  avatarUrl: string | null | undefined
  authorName: string
  isVisible: boolean
}) {
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null)
  const shouldRenderImage = Boolean(avatarUrl) && avatarUrl !== failedAvatarUrl

  return (
    <div className="mr-2 mt-0.5 flex w-8 shrink-0 justify-center sm:mr-2.5 sm:w-9">
      {isVisible ? (
        <div
          aria-label={`Агент ${authorName}`}
          className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-[0.75rem] bg-brand-900 text-[11px] font-semibold leading-none text-white shadow-sm shadow-slate-900/10 sm:h-9 sm:w-9 sm:text-[12px]"
          data-agent-avatar
          title={authorName}
        >
          {shouldRenderImage ? (
            <img
              alt=""
              className="h-full w-full object-cover"
              onError={() => {
                setFailedAvatarUrl(avatarUrl ?? null)
              }}
              src={avatarUrl ?? undefined}
            />
          ) : (
            getAuthorInitials(authorName)
          )}
        </div>
      ) : null}
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

export function MessageBubble({
  blockPosition,
  hasDateDivider,
  index,
  isConnectionAvailable,
  message,
  onOpenContextMenu,
  onReplyToMessage,
  onRetryTextMessage,
  shouldRenderHeader,
  shouldRenderMeta,
}: MessageBubbleProps) {
  const isOutgoing = message.direction === 'outgoing'
  const canReplyToMessage = !isLocalTextSend(message)
  const [isSwipeActive, setIsSwipeActive] = useState(false)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const swipeGestureRef = useRef<SwipeGesture>(EMPTY_SWIPE_GESTURE)
  const swipeOffsetRef = useRef(0)
  const shouldRenderAgentAvatar =
    !isOutgoing && shouldRenderAuthorName(blockPosition)
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

    if (shouldTriggerReply && canReplyToMessage) {
      onReplyToMessage(message)
    }
  }

  function handleSwipePointerCancel(event: PointerEvent<HTMLDivElement>) {
    resetSwipeGesture(event.currentTarget)
  }

  return (
    <div
      className={cn(
        'flex',
        isOutgoing ? 'items-end' : 'items-start',
        isOutgoing ? 'justify-end' : 'justify-start',
        getMessageWrapperSpacingClass({
          blockPosition,
          hasDateDivider,
          index,
        }),
      )}
      data-message-id={message.id}
    >
      {!isOutgoing ? (
        <AgentAvatar
          avatarUrl={message.authorAvatarUrl}
          authorName={message.authorName}
          isVisible={shouldRenderAgentAvatar}
        />
      ) : null}
      <div
        className={cn(
          'relative min-w-0',
          isOutgoing
            ? 'max-w-[86%] sm:max-w-[78%]'
            : 'max-w-[calc(86%_-_2.5rem)] sm:max-w-[calc(78%_-_2.75rem)]',
        )}
      >
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
            if (isInteractiveEventTarget(event.target) || !canReplyToMessage) {
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
          {shouldRenderHeader ? <MessageHeader message={message} /> : null}
          <div
            data-chat-bubble
            className={
              isOutgoing
                ? `${radiusClassName} break-words bg-brand-800 px-4 py-3 text-[15px] leading-7 text-white shadow-sm shadow-brand-900/10`
                : `${radiusClassName} break-words border border-slate-200 bg-white px-4 py-3 text-[15px] leading-7 text-slate-700 shadow-sm shadow-slate-900/5`
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
          </div>
          {shouldRenderMeta ? <MessageMeta message={message} /> : null}
          <RetryTextSend
            isConnectionAvailable={isConnectionAvailable}
            message={message}
            onRetryTextMessage={onRetryTextMessage}
          />
        </div>
      </div>
    </div>
  )
}
