import { createHash } from 'node:crypto'

import { ApiError } from '../../lib/errors.js'
import type { PortalAttachmentUpload } from './types.js'

export const SEND_LEDGER_MESSAGE_KIND_TEXT = 'text'
export const SEND_LEDGER_MESSAGE_KIND_ATTACHMENT = 'attachment'
export const CHAT_ATTACHMENT_MAX_FILES = 5
export const CHAT_ATTACHMENT_MAX_BYTES = 40 * 1024 * 1024
export const CHAT_ATTACHMENT_FILE_NAME_MAX_LENGTH = 255
const CHAT_ATTACHMENT_ALLOWED_MIME_TYPES = new Set([
  'application/json',
  'application/msword',
  'application/pdf',
  'application/rtf',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/x-7z-compressed',
  'application/x-tar',
  'application/zip',
  'text/csv',
  'text/plain',
  'text/rtf',
])

function isAllowedAttachmentMimeType(mimeType: string) {
  return (
    mimeType.startsWith('image/') ||
    mimeType.startsWith('video/') ||
    mimeType.startsWith('audio/') ||
    CHAT_ATTACHMENT_ALLOWED_MIME_TYPES.has(mimeType)
  )
}

function normalizeAttachmentUpload(
  attachment: PortalAttachmentUpload,
): PortalAttachmentUpload {
  const fileName = attachment.fileName.trim()
  const mimeType = attachment.mimeType.trim().toLowerCase()
  const data = Buffer.from(attachment.data)
  const size = data.byteLength

  if (!fileName) {
    throw new ApiError(
      400,
      'attachment_file_name_required',
      'Имя файла обязательно.',
    )
  }

  if (fileName.length > CHAT_ATTACHMENT_FILE_NAME_MAX_LENGTH) {
    throw new ApiError(
      400,
      'attachment_file_name_too_long',
      'Имя файла слишком длинное.',
    )
  }

  if (size <= 0) {
    throw new ApiError(400, 'attachment_empty', 'Файл пустой.')
  }

  if (size > CHAT_ATTACHMENT_MAX_BYTES) {
    throw new ApiError(
      413,
      'attachment_too_large',
      'Файл больше допустимого размера 40 МБ.',
    )
  }

  if (!mimeType || !isAllowedAttachmentMimeType(mimeType)) {
    throw new ApiError(
      415,
      'attachment_type_not_allowed',
      'Этот тип файла нельзя отправить.',
    )
  }

  return {
    data,
    fileName,
    mimeType,
    size,
  }
}

export function normalizeAttachmentUploads(
  attachments: readonly PortalAttachmentUpload[],
) {
  if (attachments.length < 1) {
    throw new ApiError(400, 'attachment_required', 'Прикрепите файл.')
  }

  if (attachments.length > CHAT_ATTACHMENT_MAX_FILES) {
    throw new ApiError(
      400,
      'attachment_count_exceeded',
      'Можно добавить не больше 5 файлов.',
    )
  }

  const normalized = attachments.map(normalizeAttachmentUpload)
  const totalBytes = normalized.reduce(
    (sum, attachment) => sum + attachment.size,
    0,
  )

  if (totalBytes > CHAT_ATTACHMENT_MAX_BYTES) {
    throw new ApiError(
      413,
      'attachment_batch_too_large',
      'Общий размер файлов не должен превышать 40 МБ.',
    )
  }

  return normalized
}

export function createTextPayloadSha256(
  content: string,
  replyToMessageId: number | null,
) {
  return createHash('sha256')
    .update(
      `${SEND_LEDGER_MESSAGE_KIND_TEXT}\0${content}\0${replyToMessageId ?? ''}`,
    )
    .digest('hex')
}

export function createAttachmentPayloadSha256(
  attachments: readonly PortalAttachmentUpload[],
  content: string | null,
  replyToMessageId: number | null,
) {
  const hash = createHash('sha256').update(
    `${SEND_LEDGER_MESSAGE_KIND_ATTACHMENT}\0${content ?? ''}\0${replyToMessageId ?? ''}\0`,
  )

  attachments.forEach((attachment, index) => {
    hash
      .update(
        `${index}\0${attachment.fileName}\0${attachment.mimeType}\0${attachment.size}\0`,
      )
      .update(attachment.data)
      .update('\0')
  })

  return hash.digest('hex')
}
