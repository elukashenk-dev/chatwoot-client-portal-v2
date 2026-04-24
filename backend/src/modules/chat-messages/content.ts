import { ApiError } from '../../lib/errors.js'

const MESSAGE_CONTENT_MAX_LENGTH = 4000

function assertMessageContentLength(content: string) {
  if (content.length > MESSAGE_CONTENT_MAX_LENGTH) {
    throw new ApiError(
      400,
      'message_content_too_long',
      'Сообщение слишком длинное.',
    )
  }
}

export function normalizeContent(content: string) {
  const normalizedContent = content.trim()

  if (!normalizedContent) {
    throw new ApiError(400, 'message_content_required', 'Введите сообщение.')
  }

  assertMessageContentLength(normalizedContent)

  return normalizedContent
}

export function normalizeOptionalContent(content?: string | null) {
  const normalizedContent = content?.trim() ?? ''

  if (!normalizedContent) {
    return null
  }

  assertMessageContentLength(normalizedContent)

  return normalizedContent
}
