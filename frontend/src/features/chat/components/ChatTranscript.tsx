import { useLayoutEffect, useRef } from 'react'

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
  FileTextIcon,
} from '../../../shared/ui/icons'

type ChatTranscriptProps = {
  hasMoreOlder: boolean
  historyErrorMessage: string | null
  isLoadingOlder: boolean
  messages: ChatMessage[]
  onLoadOlder: () => void
}

type MessageBlockPosition = 'first' | 'last' | 'middle' | 'single'

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

function MessageBubble({
  blockPosition,
  hasDateDivider,
  index,
  message,
}: {
  blockPosition: MessageBlockPosition
  hasDateDivider: boolean
  index: number
  message: ChatMessage
}) {
  const isOutgoing = message.direction === 'outgoing'
  const shouldRenderMeta = shouldRenderMessageMeta(blockPosition)
  const radiusClassName = getBubbleRadiusClass({
    blockPosition,
    isOutgoing,
  })

  return (
    <div
      className={[
        isOutgoing ? 'flex justify-end' : 'flex justify-start',
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
      <div className="max-w-[94%] sm:max-w-[88%]">
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
}: ChatTranscriptProps) {
  const scrollElementRef = useRef<HTMLElement | null>(null)
  const previousScrollSnapshotRef = useRef<TranscriptScrollSnapshot | null>(
    null,
  )

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

    previousScrollSnapshotRef.current = captureTranscriptScrollSnapshot(
      scrollElement,
      messages,
    )
  }

  return (
    <>
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
                />
              </div>
            )
          })}
        </div>
      </section>
    </>
  )
}
