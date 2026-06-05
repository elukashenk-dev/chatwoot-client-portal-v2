import { describe, expect, it, vi } from 'vitest'

import { createProfileService } from './service.js'

function createService() {
  const contactRepository = {
    findContactLinkByUserId: vi.fn().mockResolvedValue({
      chatwootContactId: 44,
      userId: 7,
    }),
  }
  const chatwootClient = {
    findContactById: vi.fn().mockResolvedValue({
      avatarUrl: 'https://chatwoot.example.test/rails/avatar.png',
      email: 'contact@example.test',
      id: 44,
      name: 'Chatwoot Contact',
      phoneNumber: '+79001234567',
    }),
    updateContactAvatar: vi.fn().mockResolvedValue(true),
  }
  const fetchAllowedAttachment = vi.fn().mockResolvedValue(
    new Response('avatar-bytes', {
      headers: {
        'content-type': 'image/png',
      },
      status: 200,
    }),
  )

  return {
    chatwootClient,
    contactRepository,
    fetchAllowedAttachment,
    service: createProfileService({
      chatwootClient,
      contactRepository,
      fetchAllowedAttachment,
    }),
  }
}

describe('profile service', () => {
  it('returns portal user fields and Chatwoot phone through a portal avatar URL', async () => {
    const { service } = createService()

    await expect(
      service.getCurrentUserProfile({
        user: {
          email: 'user@example.test',
          fullName: 'Portal User',
          id: 7,
        },
      }),
    ).resolves.toEqual({
      avatarUrl: '/api/profile/avatar',
      email: 'user@example.test',
      fullName: 'Portal User',
      phoneNumber: '+79001234567',
      result: 'ready',
    })
  })

  it('does not expose direct Chatwoot avatar URLs in profile data', async () => {
    const { service } = createService()

    const profile = await service.getCurrentUserProfile({
      user: {
        email: 'user@example.test',
        fullName: 'Portal User',
        id: 7,
      },
    })

    expect(JSON.stringify(profile)).not.toContain('chatwoot.example.test')
    expect(profile.avatarUrl).toBe('/api/profile/avatar')
  })

  it('fails closed when the current user has no linked Chatwoot contact', async () => {
    const { contactRepository, service } = createService()

    contactRepository.findContactLinkByUserId.mockResolvedValueOnce(null)

    await expect(
      service.getCurrentUserProfile({
        user: {
          email: 'user@example.test',
          fullName: null,
          id: 7,
        },
      }),
    ).resolves.toEqual({
      avatarUrl: null,
      email: 'user@example.test',
      fullName: null,
      phoneNumber: null,
      reason: 'contact_unavailable',
      result: 'unavailable',
    })
  })

  it('uploads avatar only to the current linked contact', async () => {
    const { chatwootClient, service } = createService()

    await expect(
      service.updateCurrentUserAvatar({
        avatar: {
          data: Buffer.from('avatar'),
          fileName: ' avatar.png ',
          mimeType: ' Image/PNG ',
          size: 6,
        },
        userId: 7,
      }),
    ).resolves.toEqual({
      avatarUrl: '/api/profile/avatar',
      result: 'updated',
    })
    expect(chatwootClient.updateContactAvatar).toHaveBeenCalledWith(44, {
      data: expect.any(Buffer),
      fileName: 'avatar.png',
      mimeType: 'image/png',
      size: 6,
    })
  })

  it('proxies the current linked contact avatar through the attachment proxy', async () => {
    const { fetchAllowedAttachment, service } = createService()

    const avatar = await service.getCurrentUserAvatar({ userId: 7 })

    expect(fetchAllowedAttachment).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      initialUrl: 'https://chatwoot.example.test/rails/avatar.png',
    })
    expect(avatar.status).toBe(200)
    expect(avatar.headers.get('content-type')).toBe('image/png')
  })
})
