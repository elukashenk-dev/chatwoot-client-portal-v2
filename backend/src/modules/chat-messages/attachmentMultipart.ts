import type { MultipartFile, MultipartValue } from '@fastify/multipart'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { ApiError } from '../../lib/errors.js'
import {
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_ATTACHMENT_MAX_FILES,
} from './attachmentSend.js'
import type { PortalAttachmentUpload } from './types.js'

const CHAT_ATTACHMENT_FIELD_MAX_BYTES = 16 * 1024
const CHAT_ATTACHMENT_REQUEST_OVERHEAD_BYTES = 256 * 1024

export const CHAT_ATTACHMENT_REQUEST_MAX_BYTES =
  CHAT_ATTACHMENT_MAX_BYTES + CHAT_ATTACHMENT_REQUEST_OVERHEAD_BYTES

export const CHAT_ATTACHMENT_MULTIPART_LIMITS = {
  fields: 5,
  fileSize: CHAT_ATTACHMENT_MAX_BYTES,
  files: CHAT_ATTACHMENT_MAX_FILES,
  parts: 10,
} as const

const sendChatAttachmentFieldsSchema = z
  .object({
    clientMessageKey: z.string().trim().min(1).max(200),
    content: z.string().trim().max(4000).optional(),
    replyToMessageId: z.coerce.number().int().positive().optional(),
    threadId: z.string().trim().min(1).max(80),
  })
  .strict()

type AttachmentMultipartFields = {
  clientMessageKey?: string
  content?: string
  replyToMessageId?: string
  threadId?: string
}

function getMultipartFieldValue(part: MultipartValue) {
  if (typeof part.value === 'string') {
    return part.value
  }

  if (Buffer.isBuffer(part.value)) {
    return part.value.toString('utf8')
  }

  return null
}

function applyMultipartField(
  fields: AttachmentMultipartFields,
  part: MultipartValue,
) {
  if (
    part.fieldname !== 'clientMessageKey' &&
    part.fieldname !== 'content' &&
    part.fieldname !== 'replyToMessageId' &&
    part.fieldname !== 'threadId'
  ) {
    throw new ApiError(400, 'invalid_attachment_field', 'Некорректный запрос.')
  }

  const value = getMultipartFieldValue(part)

  if (value === null) {
    throw new ApiError(400, 'invalid_attachment_field', 'Некорректный запрос.')
  }

  if (part.valueTruncated) {
    throw new ApiError(
      400,
      'attachment_field_too_large',
      'Поле вложения слишком длинное.',
    )
  }

  fields[part.fieldname] = value
}

async function readMultipartFile(part: MultipartFile) {
  if (part.fieldname !== 'attachments') {
    throw new ApiError(
      400,
      'attachment_field_required',
      'Файлы нужно передать в поле attachments.',
    )
  }

  const data = await part.toBuffer()

  return {
    data,
    fileName: part.filename,
    mimeType: part.mimetype,
    size: data.byteLength,
  }
}

function toMultipartApiError(app: FastifyInstance, error: unknown) {
  if (error instanceof ApiError) {
    return error
  }

  if (error instanceof app.multipartErrors.RequestFileTooLargeError) {
    return new ApiError(
      413,
      'attachment_too_large',
      'Файл больше допустимого размера 40 МБ.',
    )
  }

  if (error instanceof app.multipartErrors.FilesLimitError) {
    return new ApiError(
      400,
      'attachment_count_exceeded',
      'Можно добавить не больше 5 файлов.',
    )
  }

  if (
    error instanceof app.multipartErrors.FieldsLimitError ||
    error instanceof app.multipartErrors.PartsLimitError
  ) {
    return new ApiError(
      400,
      'invalid_attachment_request',
      'Некорректный запрос вложений.',
    )
  }

  if (error instanceof app.multipartErrors.InvalidMultipartContentTypeError) {
    return new ApiError(
      415,
      'multipart_required',
      'Файл нужно отправить как multipart/form-data.',
    )
  }

  return null
}

export async function parseAttachmentUploads(
  app: FastifyInstance,
  request: FastifyRequest,
): Promise<{
  attachments: PortalAttachmentUpload[]
  clientMessageKey: string
  content: string | null
  replyToMessageId: number | null
  threadId: string
}> {
  if (!request.isMultipart()) {
    throw new ApiError(
      415,
      'multipart_required',
      'Файл нужно отправить как multipart/form-data.',
    )
  }

  const fields: AttachmentMultipartFields = {}
  const attachments: PortalAttachmentUpload[] = []
  let aggregateBytes = 0

  try {
    const parts = request.parts({
      limits: {
        ...CHAT_ATTACHMENT_MULTIPART_LIMITS,
        fieldSize: CHAT_ATTACHMENT_FIELD_MAX_BYTES,
      },
    })

    for await (const part of parts) {
      if (part.type === 'field') {
        applyMultipartField(fields, part)
        continue
      }

      const attachment = await readMultipartFile(part)

      attachments.push(attachment)
      aggregateBytes += attachment.size

      if (aggregateBytes > CHAT_ATTACHMENT_MAX_BYTES) {
        throw new ApiError(
          413,
          'attachment_batch_too_large',
          'Общий размер файлов не должен превышать 40 МБ.',
        )
      }
    }
  } catch (error) {
    const apiError = toMultipartApiError(app, error)

    if (apiError) {
      throw apiError
    }

    throw error
  }

  if (attachments.length === 0) {
    throw new ApiError(400, 'attachment_required', 'Прикрепите файл.')
  }

  const parsedFields = sendChatAttachmentFieldsSchema.parse(fields)

  return {
    attachments,
    clientMessageKey: parsedFields.clientMessageKey,
    content: parsedFields.content || null,
    replyToMessageId: parsedFields.replyToMessageId ?? null,
    threadId: parsedFields.threadId,
  }
}
