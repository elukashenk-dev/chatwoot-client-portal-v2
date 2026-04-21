import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { MultipartFile, MultipartValue } from '@fastify/multipart'
import { z } from 'zod'

import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../lib/errors.js'
import { assertAllowedOrigin } from '../../lib/origin.js'
import type { AuthService } from '../auth/service.js'
import { resolveAuthenticatedPortalUser } from '../chat-context/routes.js'
import type { ChatMessagesService, PortalAttachmentUpload } from './service.js'
import { CHAT_ATTACHMENT_MAX_BYTES } from './service.js'

const chatMessagesQuerySchema = z.object({
  beforeMessageId: z.coerce.number().int().positive().optional(),
  primaryConversationId: z.coerce.number().int().positive().optional(),
})

const sendChatMessageBodySchema = z.object({
  clientMessageKey: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1, 'Введите сообщение.').max(4000),
  primaryConversationId: z.number().int().positive().optional(),
})

const sendChatAttachmentFieldsSchema = z.object({
  clientMessageKey: z.string().trim().min(1).max(200),
  primaryConversationId: z.coerce.number().int().positive().optional(),
})

type AttachmentMultipartFields = {
  clientMessageKey?: string
  primaryConversationId?: string
}

type RegisterChatMessagesRoutesOptions = {
  authService: AuthService
  chatMessagesService: ChatMessagesService
  env: AppEnv
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
    part.fieldname !== 'primaryConversationId'
  ) {
    return
  }

  const value = getMultipartFieldValue(part)

  if (value === null) {
    throw new ApiError(400, 'invalid_attachment_field', 'Некорректный запрос.')
  }

  fields[part.fieldname] = value
}

async function readMultipartFile(part: MultipartFile) {
  if (part.fieldname !== 'attachment') {
    throw new ApiError(
      400,
      'attachment_field_required',
      'Файл нужно передать в поле attachment.',
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

  if (
    error instanceof app.multipartErrors.FilesLimitError ||
    error instanceof app.multipartErrors.FieldsLimitError ||
    error instanceof app.multipartErrors.PartsLimitError
  ) {
    return new ApiError(
      400,
      'invalid_attachment_request',
      'Можно отправить только один файл.',
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

async function parseAttachmentUpload(
  app: FastifyInstance,
  request: FastifyRequest,
): Promise<{
  attachment: PortalAttachmentUpload
  clientMessageKey: string
  primaryConversationId: number | null
}> {
  if (!request.isMultipart()) {
    throw new ApiError(
      415,
      'multipart_required',
      'Файл нужно отправить как multipart/form-data.',
    )
  }

  const fields: AttachmentMultipartFields = {}
  let attachment: PortalAttachmentUpload | null = null

  try {
    const parts = request.parts({
      limits: {
        fields: 4,
        fileSize: CHAT_ATTACHMENT_MAX_BYTES,
        files: 1,
        parts: 5,
      },
    })

    for await (const part of parts) {
      if (part.type === 'field') {
        applyMultipartField(fields, part)
        continue
      }

      if (attachment) {
        throw new ApiError(
          400,
          'attachment_single_file_required',
          'Можно отправить только один файл.',
        )
      }

      attachment = await readMultipartFile(part)
    }
  } catch (error) {
    const apiError = toMultipartApiError(app, error)

    if (apiError) {
      throw apiError
    }

    throw error
  }

  if (!attachment) {
    throw new ApiError(400, 'attachment_required', 'Прикрепите файл.')
  }

  const parsedFields = sendChatAttachmentFieldsSchema.parse(fields)

  return {
    attachment,
    clientMessageKey: parsedFields.clientMessageKey,
    primaryConversationId: parsedFields.primaryConversationId ?? null,
  }
}

export function registerChatMessagesRoutes(
  app: FastifyInstance,
  { authService, chatMessagesService, env }: RegisterChatMessagesRoutesOptions,
) {
  app.get('/api/chat/messages', async (request, reply) => {
    const user = await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })
    const query = chatMessagesQuerySchema.parse(request.query)

    return chatMessagesService.getCurrentUserChatMessages({
      beforeMessageId: query.beforeMessageId ?? null,
      primaryConversationId: query.primaryConversationId ?? null,
      userId: user.id,
    })
  })

  app.post('/api/chat/messages', async (request, reply) => {
    assertAllowedOrigin(request, env.APP_ORIGIN)

    const user = await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })
    const body = sendChatMessageBodySchema.parse(request.body)

    return chatMessagesService.sendCurrentUserTextMessage({
      clientMessageKey: body.clientMessageKey,
      content: body.content,
      primaryConversationId: body.primaryConversationId ?? null,
      userId: user.id,
    })
  })

  app.post('/api/chat/messages/attachment', async (request, reply) => {
    assertAllowedOrigin(request, env.APP_ORIGIN)

    const user = await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })
    const upload = await parseAttachmentUpload(app, request)

    return chatMessagesService.sendCurrentUserAttachmentMessage({
      attachment: upload.attachment,
      clientMessageKey: upload.clientMessageKey,
      primaryConversationId: upload.primaryConversationId,
      userId: user.id,
    })
  })
}
