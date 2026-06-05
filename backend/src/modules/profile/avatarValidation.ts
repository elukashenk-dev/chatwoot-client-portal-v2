import { ApiError } from '../../lib/errors.js'
import type { ProfileAvatarUpload } from './types.js'

export const PROFILE_AVATAR_MAX_BYTES = 15 * 1024 * 1024

const PROFILE_AVATAR_ALLOWED_MIME_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
])

export function normalizeProfileAvatarUpload(
  avatar: ProfileAvatarUpload,
): ProfileAvatarUpload {
  const fileName = avatar.fileName.trim() || 'avatar'
  const mimeType = avatar.mimeType.trim().toLowerCase()
  const data = Buffer.from(avatar.data)
  const size = data.byteLength

  if (size <= 0) {
    throw new ApiError(
      400,
      'profile_avatar_empty',
      'Файл пустой. Выберите другое изображение.',
    )
  }

  if (size > PROFILE_AVATAR_MAX_BYTES) {
    throw new ApiError(
      413,
      'profile_avatar_too_large',
      'Файл должен быть не больше 15 МБ.',
    )
  }

  if (!PROFILE_AVATAR_ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new ApiError(
      415,
      'profile_avatar_type_not_allowed',
      'Можно загрузить JPEG, PNG или GIF.',
    )
  }

  return {
    data,
    fileName,
    mimeType,
    size,
  }
}
