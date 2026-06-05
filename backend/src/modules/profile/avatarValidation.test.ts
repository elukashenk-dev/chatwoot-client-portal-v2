import { describe, expect, it } from 'vitest'

import {
  PROFILE_AVATAR_MAX_BYTES,
  normalizeProfileAvatarUpload,
} from './avatarValidation.js'

describe('profile avatar validation', () => {
  it('accepts a non-empty PNG avatar under the Chatwoot limit', () => {
    const avatar = normalizeProfileAvatarUpload({
      data: Buffer.from('png-bytes'),
      fileName: ' avatar.png ',
      mimeType: ' Image/PNG ',
      size: 9,
    })

    expect(avatar).toMatchObject({
      fileName: 'avatar.png',
      mimeType: 'image/png',
      size: 9,
    })
    expect(Buffer.from(avatar.data).toString('utf8')).toBe('png-bytes')
  })

  it('rejects empty avatars', () => {
    expect(() =>
      normalizeProfileAvatarUpload({
        data: Buffer.alloc(0),
        fileName: 'avatar.png',
        mimeType: 'image/png',
        size: 0,
      }),
    ).toThrow('Файл пустой. Выберите другое изображение.')
  })

  it('rejects avatars over 15 MB', () => {
    expect(() =>
      normalizeProfileAvatarUpload({
        data: Buffer.alloc(PROFILE_AVATAR_MAX_BYTES + 1),
        fileName: 'avatar.png',
        mimeType: 'image/png',
        size: PROFILE_AVATAR_MAX_BYTES + 1,
      }),
    ).toThrow('Файл должен быть не больше 15 МБ.')
  })

  it('rejects unsupported avatar mime types', () => {
    expect(() =>
      normalizeProfileAvatarUpload({
        data: Buffer.from('svg'),
        fileName: 'avatar.svg',
        mimeType: 'image/svg+xml',
        size: 3,
      }),
    ).toThrow('Можно загрузить JPEG, PNG или GIF.')
  })
})
