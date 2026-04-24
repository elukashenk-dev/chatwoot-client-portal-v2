import type { TranscriptScrollAction } from '../ChatTranscriptScroll'
import type { ChatAttachment, ChatMessage } from '../../types'

export type MessageBlockPosition = 'first' | 'last' | 'middle' | 'single'

export type MessageContextMenuState = {
  message: ChatMessage
  x: number
  y: number
} | null

const MESSAGE_CONTEXT_MENU_HEIGHT_PX = 104
const MESSAGE_CONTEXT_MENU_WIDTH_PX = 184
const MESSAGE_CONTEXT_MENU_VIEWPORT_PADDING_PX = 12
const MESSAGE_DATE_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
})
const MESSAGE_DAY_KEY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})
const MESSAGE_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  hour12: false,
  minute: '2-digit',
})

export function formatMessageDate(value: string) {
  return MESSAGE_DATE_FORMATTER.format(new Date(value))
}

function formatMessageDayKey(value: string) {
  const parts = MESSAGE_DAY_KEY_FORMATTER.formatToParts(new Date(value))

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  return year && month && day ? `${year}-${month}-${day}` : ''
}

export function formatMessageMetadataTimestamp(value: string) {
  return MESSAGE_TIMESTAMP_FORMATTER.format(new Date(value))
}

export function requestNextFrame(callback: () => void) {
  if (typeof window.requestAnimationFrame !== 'function') {
    callback()
    return null
  }

  return window.requestAnimationFrame(callback)
}

export function cancelNextFrame(frameId: number | null) {
  if (frameId !== null && typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(frameId)
  }
}

function clampValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function getContextMenuPosition({
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

export function isInteractiveEventTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'a, button, input, textarea, select, [role="button"], [data-chat-context-menu]',
      ),
    )
  )
}

export function shouldUseDesktopMessageContextMenu() {
  return window.matchMedia?.('(pointer: fine)').matches ?? true
}

export function getMessageCopyText(message: ChatMessage) {
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

export async function copyTextToClipboard(text: string) {
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

export function applyTranscriptScrollAction(
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

export function getMessageBlockPosition(
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

export function shouldRenderAuthorName(blockPosition: MessageBlockPosition) {
  return blockPosition === 'first' || blockPosition === 'single'
}

export function getAuthorInitials(authorName: string) {
  const words = authorName.trim().split(/\s+/).filter(Boolean)

  if (words.length === 0) {
    return 'PG'
  }

  if (words.length === 1) {
    return Array.from(words[0]).slice(0, 2).join('').toUpperCase()
  }

  return words
    .slice(0, 2)
    .map((word) => Array.from(word).at(0)?.toUpperCase() ?? '')
    .join('')
}

export function getBubbleRadiusClass({
  blockPosition,
  isOutgoing,
}: {
  blockPosition: MessageBlockPosition
  isOutgoing: boolean
}) {
  if (blockPosition === 'single') {
    return isOutgoing
      ? 'rounded-[0.9rem] rounded-tr-[0.4rem]'
      : 'rounded-[0.9rem] rounded-tl-[0.4rem]'
  }

  if (blockPosition === 'first') {
    return isOutgoing
      ? 'rounded-[0.9rem] rounded-tr-[0.4rem]'
      : 'rounded-[0.9rem] rounded-tl-[0.4rem]'
  }

  return 'rounded-[0.9rem]'
}

export function getMessageWrapperSpacingClass({
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

export function formatAttachmentSize(value: number | null) {
  if (!value) {
    return 'Размер неизвестен'
  }

  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} МБ`
  }

  return `${Math.max(1, Math.round(value / 1024))} КБ`
}

export function isAudioAttachment(attachment: ChatAttachment) {
  return attachment.fileType.toLowerCase() === 'audio'
}

export function getReplyPreviewText(message: ChatMessage['replyTo']) {
  return (
    message?.content?.trim() ||
    message?.attachmentName ||
    'Сообщение недоступно'
  )
}

export function shouldRenderDateDivider(
  messages: ChatMessage[],
  index: number,
) {
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
