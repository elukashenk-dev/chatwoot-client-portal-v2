import { Readable } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'

import type { MultipartFile } from '@fastify/multipart'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../lib/errors.js'
import { assertAllowedTenantOrigin } from '../../lib/origin.js'
import { resolveAuthenticatedPortalUser } from '../auth/currentUser.js'
import type { AuthService } from '../auth/service.js'
import {
  ATTACHMENT_PROXY_CACHE_CONTROL,
  copyAttachmentProxyHeaders,
} from '../chat-messages/attachmentProxyHeaders.js'
import { PROFILE_AVATAR_MAX_BYTES } from './avatarValidation.js'
import type { ProfileService } from './service.js'
import type { ProfileAvatarUpload } from './types.js'

const PROFILE_AVATAR_REQUEST_OVERHEAD_BYTES = 128 * 1024
const PROFILE_AVATAR_REQUEST_MAX_BYTES =
  PROFILE_AVATAR_MAX_BYTES + PROFILE_AVATAR_REQUEST_OVERHEAD_BYTES

type RegisterProfileRoutesOptions = {
  authService: AuthService
  createProfileService: (request: FastifyRequest) => ProfileService
  env: AppEnv
}

async function sendAvatarProxy({
  avatar,
  reply,
}: {
  avatar: Awaited<ReturnType<ProfileService['getCurrentUserAvatar']>>
  reply: FastifyReply
}) {
  copyAttachmentProxyHeaders({
    headers: avatar.headers,
    reply,
  })
  reply.header('cache-control', ATTACHMENT_PROXY_CACHE_CONTROL)
  reply.code(avatar.status)

  if (!avatar.body) {
    return reply.send()
  }

  return reply.send(Readable.fromWeb(avatar.body as NodeReadableStream))
}

async function readAvatarFile(
  part: MultipartFile,
): Promise<ProfileAvatarUpload> {
  if (part.fieldname !== 'avatar') {
    throw new ApiError(
      400,
      'profile_avatar_field_required',
      'Файл нужно передать в поле avatar.',
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
      'profile_avatar_too_large',
      'Файл должен быть не больше 15 МБ.',
    )
  }

  if (
    error instanceof app.multipartErrors.FilesLimitError ||
    error instanceof app.multipartErrors.FieldsLimitError ||
    error instanceof app.multipartErrors.PartsLimitError
  ) {
    return new ApiError(
      400,
      'invalid_profile_avatar_request',
      'Можно загрузить только один аватар.',
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

async function parseAvatarUpload(
  app: FastifyInstance,
  request: FastifyRequest,
) {
  if (!request.isMultipart()) {
    throw new ApiError(
      415,
      'multipart_required',
      'Файл нужно отправить как multipart/form-data.',
    )
  }

  let avatar: ProfileAvatarUpload | null = null

  try {
    const parts = request.parts({
      limits: {
        fields: 0,
        fileSize: PROFILE_AVATAR_MAX_BYTES,
        files: 1,
        parts: 1,
      },
    })

    for await (const part of parts) {
      if (part.type === 'field') {
        throw new ApiError(
          400,
          'invalid_profile_avatar_request',
          'Можно загрузить только один аватар.',
        )
      }

      if (avatar) {
        throw new ApiError(
          400,
          'invalid_profile_avatar_request',
          'Можно загрузить только один аватар.',
        )
      }

      avatar = await readAvatarFile(part)
    }
  } catch (error) {
    const apiError = toMultipartApiError(app, error)

    if (apiError) {
      throw apiError
    }

    throw error
  }

  if (!avatar) {
    throw new ApiError(400, 'profile_avatar_required', 'Выберите файл аватара.')
  }

  return avatar
}

export function registerProfileRoutes(
  app: FastifyInstance,
  { authService, createProfileService, env }: RegisterProfileRoutesOptions,
) {
  app.addContentTypeParser(
    /^multipart\/form-data(;.*)?$/i,
    {
      bodyLimit: PROFILE_AVATAR_REQUEST_MAX_BYTES,
      parseAs: 'buffer',
    },
    (_request, _payload, done) => {
      done(null)
    },
  )

  app.get('/api/profile', async (request, reply) => {
    const user = await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })

    return createProfileService(request).getCurrentUserProfile({ user })
  })

  app.get('/api/profile/avatar', async (request, reply) => {
    const user = await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })
    const avatar = await createProfileService(request).getCurrentUserAvatar({
      userId: user.id,
    })

    return sendAvatarProxy({ avatar, reply })
  })

  app.post('/api/profile/avatar', async (request, reply) => {
    assertAllowedTenantOrigin(request)

    const user = await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })
    const avatar = await parseAvatarUpload(app, request)

    return createProfileService(request).updateCurrentUserAvatar({
      avatar,
      userId: user.id,
    })
  })
}
