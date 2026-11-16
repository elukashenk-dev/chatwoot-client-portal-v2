import { describe, expect, it, vi } from 'vitest'

import { ChatwootClientRequestError } from '../../integrations/chatwoot/client.js'
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
  it('returns current Chatwoot name and phone with portal login email and avatar URL', async () => {
    const { service } = createService()

    await expect(
      service.getCurrentUserProfile({
        user: {
          email: 'user@example.test',
          fullName: 'Portal User',
          id: 7,
          passwordConfigured: true,
        },
      }),
    ).resolves.toEqual({
      avatarUrl: '/api/profile/avatar',
      email: 'user@example.test',
      fullName: 'Chatwoot Contact',
      phoneNumber: '+79001234567',
      result: 'ready',
    })
  })

  it('refreshes contact name and phone without changing the portal identity or adding calls', async () => {
    const { service, chatwootClient, contactRepository } = createService()
    const user = {
      email: 'office@example.test',
      fullName: 'Иван Петров',
      id: 7,
      passwordConfigured: true,
    }
    const contact = await chatwootClient.findContactById()
    chatwootClient.findContactById.mockClear()
    chatwootClient.findContactById
      .mockResolvedValueOnce({
        ...contact,
        name: 'Иван Петров',
        phoneNumber: '+79001111111',
      })
      .mockResolvedValueOnce({
        ...contact,
        name: '  Анна Сидорова  ',
        phoneNumber: '+79002222222',
      })

    expect(await service.getCurrentUserProfile({ user })).toMatchObject({
      fullName: 'Иван Петров',
      phoneNumber: '+79001111111',
    })
    expect(await service.getCurrentUserProfile({ user })).toEqual({
      avatarUrl: '/api/profile/avatar',
      email: user.email,
      fullName: 'Анна Сидорова',
      phoneNumber: '+79002222222',
      result: 'ready',
    })
    expect(user.fullName).toBe('Иван Петров')
    expect(contactRepository.findContactLinkByUserId.mock.calls).toEqual([
      [7],
      [7],
    ])
    expect(chatwootClient.findContactById.mock.calls).toEqual([[44], [44]])
  })

  it.each([null, '', '   '])(
    'does not revive the old name when the current name is %s',
    async (name) => {
      const { service, chatwootClient } = createService()
      chatwootClient.findContactById.mockResolvedValue({
        id: 44,
        name,
        phoneNumber: null,
        avatarUrl: null,
      })
      expect(
        await service.getCurrentUserProfile({
          user: {
            email: 'office@example.test',
            fullName: 'Old Employee',
            id: 7,
            passwordConfigured: true,
          },
        }),
      ).toMatchObject({ fullName: null, phoneNumber: null, result: 'ready' })
    },
  )

  it.each(['missing', 'unavailable'])(
    'does not expose the old name when the contact is %s',
    async (failure) => {
      const { service, chatwootClient } = createService()
      if (failure === 'missing') {
        chatwootClient.findContactById.mockResolvedValue(null)
      } else {
        chatwootClient.findContactById.mockRejectedValue(
          new ChatwootClientRequestError('Contact unavailable'),
        )
      }
      expect(
        await service.getCurrentUserProfile({
          user: {
            email: 'office@example.test',
            fullName: 'Old Employee',
            id: 7,
            passwordConfigured: true,
          },
        }),
      ).toMatchObject({
        fullName: null,
        phoneNumber: null,
        result: 'unavailable',
      })
    },
  )

  it('does not expose direct Chatwoot avatar URLs in profile data', async () => {
    const { service } = createService()

    const profile = await service.getCurrentUserProfile({
      user: {
        email: 'user@example.test',
        fullName: 'Portal User',
        id: 7,
        passwordConfigured: true,
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
          passwordConfigured: true,
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
