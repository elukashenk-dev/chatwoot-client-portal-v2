import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { MultipartFile, MultipartValue } from '@fastify/multipart'
import { z } from 'zod'

import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../lib/errors.js'
import { assertAllowedTenantOrigin } from '../../lib/origin.js'
import { resolveAuthenticatedPortalUser } from '../auth/currentUser.js'
import type { AuthService } from '../auth/service.js'
import { PRIVATE_CHAT_THREAD_ID } from '../chat-threads/privateThread.js'
import { requireTenantContext } from '../tenants/routes.js'
import type { ChatSendRateLimiter } from './rateLimit.js'
import type { ChatMessagesService, PortalAttachmentUpload } from './service.js'
import { CHAT_ATTACHMENT_MAX_BYTES } from './service.js'

const CHAT_ATTACHMENT_FIELD_MAX_BYTES = 16 * 1024
const CHAT_ATTACHMENT_REQUEST_OVERHEAD_BYTES = 256 * 1024
const CHAT_ATTACHMENT_REQUEST_MAX_BYTES =
  CHAT_ATTACHMENT_MAX_BYTES + CHAT_ATTACHMENT_REQUEST_OVERHEAD_BYTES

const publicThreadIdSchema = z.string().trim().min(1).max(80)

const chatMessagesQuerySchema = z
  .object({
    beforeMessageId: z.coerce.number().int().positive().optional(),
    threadId: publicThreadIdSchema.optional(),
  })
  .strict()

const sendChatMessageBodySchema = z
  .object({
    clientMessageKey: z.string().trim().min(1).max(200),
    content: z.string().trim().min(1, 'Введите сообщение.').max(4000),
    replyToMessageId: z.number().int().positive().optional(),
    threadId: publicThreadIdSchema,
  })
  .strict()

const sendChatAttachmentFieldsSchema = z
  .object({
    clientMessageKey: z.string().trim().min(1).max(200),
    content: z.string().trim().max(4000).optional(),
    replyToMessageId: z.coerce.number().int().positive().optional(),
    threadId: publicThreadIdSchema,
  })
  .strict()

type AttachmentMultipartFields = {
  clientMessageKey?: string
  content?: string
  replyToMessageId?: string
  threadId?: string
}

type RegisterChatMessagesRoutesOptions = {
  authService: AuthService
  chatSendRateLimiter: ChatSendRateLimiter
  createChatMessagesService: (request: FastifyRequest) => ChatMessagesService
  env: AppEnv
}

async function enforceChatSendRateLimit({
  chatSendRateLimiter,
  kind,
  reply,
  request,
  threadId,
  userId,
}: {
  chatSendRateLimiter: ChatSendRateLimiter
  kind: 'attachment' | 'text'
  reply: {
    header: (name: string, value: string) => unknown
  }
  request: FastifyRequest
  threadId: string
  userId: number
}) {
  const tenant = requireTenantContext(request)
  const rateLimit = await chatSendRateLimiter.consume({
    kind,
    tenantId: tenant.id,
    threadId,
    userId,
  })

  if (rateLimit.status === 'allowed') {
    return
  }

  reply.header('Retry-After', String(rateLimit.retryAfterSeconds))

  throw new ApiError(
    429,
    'CHAT_SEND_RATE_LIMITED',
    'Слишком много сообщений. Попробуйте позже.',
  )
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
  let attachment: PortalAttachmentUpload | null = null

  try {
    const parts = request.parts({
      limits: {
        fields: 5,
        fieldSize: CHAT_ATTACHMENT_FIELD_MAX_BYTES,
        fileSize: CHAT_ATTACHMENT_MAX_BYTES,
        files: 1,
        parts: 6,
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
    content: parsedFields.content || null,
    replyToMessageId: parsedFields.replyToMessageId ?? null,
    threadId: parsedFields.threadId,
  }
}

export function registerChatMessagesRoutes(
  app: FastifyInstance,
  {
    authService,
    chatSendRateLimiter,
    createChatMessagesService,
    env,
  }: RegisterChatMessagesRoutesOptions,
) {
  app.get('/api/chat/messages', async (request, reply) => {
    const user = await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })
    const query = chatMessagesQuerySchema.parse(request.query)

    return createChatMessagesService(request).getCurrentUserChatMessages({
      beforeMessageId: query.beforeMessageId ?? null,
      threadId: query.threadId ?? PRIVATE_CHAT_THREAD_ID,
      userId: user.id,
    })
  })

  app.post('/api/chat/messages', async (request, reply) => {
    assertAllowedTenantOrigin(request)

    const user = await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })
    const body = sendChatMessageBodySchema.parse(request.body)

    await enforceChatSendRateLimit({
      chatSendRateLimiter,
      kind: 'text',
      reply,
      request,
      threadId: body.threadId,
      userId: user.id,
    })

    return createChatMessagesService(request).sendCurrentUserTextMessage({
      clientMessageKey: body.clientMessageKey,
      content: body.content,
      replyToMessageId: body.replyToMessageId ?? null,
      threadId: body.threadId,
      userId: user.id,
    })
  })

  app.post(
    '/api/chat/messages/attachment',
    {
      bodyLimit: CHAT_ATTACHMENT_REQUEST_MAX_BYTES,
    },
    async (request, reply) => {
      assertAllowedTenantOrigin(request)

      const user = await resolveAuthenticatedPortalUser({
        authService,
        env,
        reply,
        request,
      })
      const upload = await parseAttachmentUpload(app, request)

      await enforceChatSendRateLimit({
        chatSendRateLimiter,
        kind: 'attachment',
        reply,
        request,
        threadId: upload.threadId,
        userId: user.id,
      })

      return createChatMessagesService(
        request,
      ).sendCurrentUserAttachmentMessage({
        attachment: upload.attachment,
        clientMessageKey: upload.clientMessageKey,
        content: upload.content,
        replyToMessageId: upload.replyToMessageId,
        threadId: upload.threadId,
        userId: user.id,
      })
    },
  )
}
