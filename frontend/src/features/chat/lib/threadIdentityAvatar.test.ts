import { describe, expect, it } from 'vitest'

import { resolveThreadIdentityAvatarUrl } from './threadIdentityAvatar'

describe('resolveThreadIdentityAvatarUrl', () => {
  it('uses the branding logo when the thread has no avatar', () => {
    expect(
      resolveThreadIdentityAvatarUrl({
        brandingLogoUrl: '/api/branding/assets/11?v=11',
        threadAvatarUrl: null,
      }),
    ).toBe('/api/branding/assets/11?v=11')
  })

  it('replaces tenant default icons with the branding logo', () => {
    expect(
      resolveThreadIdentityAvatarUrl({
        brandingLogoUrl: '/api/branding/assets/11?v=11',
        threadAvatarUrl: '/api/tenant/icons/icon-192.png',
      }),
    ).toBe('/api/branding/assets/11?v=11')
  })

  it('keeps explicit thread avatars over the branding logo', () => {
    expect(
      resolveThreadIdentityAvatarUrl({
        brandingLogoUrl: '/api/branding/assets/11?v=11',
        threadAvatarUrl: '/api/chat/threads/group%3A154/avatar',
      }),
    ).toBe('/api/chat/threads/group%3A154/avatar')
  })
})
