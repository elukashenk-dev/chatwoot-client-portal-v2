import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../lib/errors.js'
import type { ChatContextRepository } from '../chat-context/repository.js'
import { createChatThreadsService } from './service.js'

function createRepositoryStub(
  overrides: Partial<
    Pick<
      ChatContextRepository,
      'createContactLink' | 'findContactLinkByUserId' | 'findPortalUserById'
    >
  > = {},
): Pick<
  ChatContextRepository,
  'createContactLink' | 'findContactLinkByUserId' | 'findPortalUserById'
> {
  return {
    createContactLink: vi.fn().mockResolvedValue({
      chatwootContactId: 44,
      userId: 7,
    }),
    findContactLinkByUserId: vi.fn().mockResolvedValue({
      chatwootContactId: 44,
      userId: 7,
    }),
    findPortalUserById: vi.fn().mockResolvedValue({
      email: 'ivan@example.com',
      id: 7,
    }),
    ...overrides,
  }
}

function createChatwootClientStub({
  companyContactIds = '154',
  companyContactOverrides = {},
}: {
  companyContactIds?: string
  companyContactOverrides?: Record<string, unknown>
} = {}) {
  return {
    findContactByEmail: vi.fn(),
    findContactById: vi.fn(async (contactId: number) => {
      if (contactId === 44) {
        return {
          customAttributes: {
            portal_client_company_contact_ids: companyContactIds,
            portal_contact_type: 'person',
            portal_enabled: true,
          },
          email: 'ivan@example.com',
          id: 44,
          name: 'Иван Петров',
        }
      }

      if (contactId === 154) {
        return {
          customAttributes: {
            portal_contact_type: 'company',
            portal_enabled: true,
          },
          email: 'office@romashka.ru',
          id: 154,
          name: 'ООО "Ромашка"',
          ...companyContactOverrides,
        }
      }

      return null
    }),
  }
}

function createService({
  chatwootClient = createChatwootClientStub(),
  repository = createRepositoryStub(),
}: {
  chatwootClient?: ReturnType<typeof createChatwootClientStub>
  repository?: ReturnType<typeof createRepositoryStub>
} = {}) {
  return createChatThreadsService({
    chatContextRepository: repository,
    chatwootClient,
  })
}

describe('createChatThreadsService', () => {
  it('returns private thread plus enabled company threads from person attributes', async () => {
    const service = createService()

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).resolves.toEqual({
      activeThreadId: 'private:me',
      threads: [
        {
          id: 'private:me',
          subtitle: 'Только вы и поддержка',
          title: 'Личный чат',
          type: 'private',
        },
        {
          id: 'company:154',
          subtitle: 'Общий чат компании',
          title: 'ООО "Ромашка"',
          type: 'company',
        },
      ],
    })
  })

  it('deduplicates company IDs before looking up company contacts', async () => {
    const chatwootClient = createChatwootClientStub({
      companyContactIds: '154, 154,154',
    })
    const service = createService({ chatwootClient })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).resolves.toEqual({
      activeThreadId: 'private:me',
      threads: [
        expect.objectContaining({
          id: 'private:me',
        }),
        expect.objectContaining({
          id: 'company:154',
        }),
      ],
    })
    expect(chatwootClient.findContactById).toHaveBeenCalledTimes(2)
    expect(chatwootClient.findContactById).toHaveBeenNthCalledWith(1, 44)
    expect(chatwootClient.findContactById).toHaveBeenNthCalledWith(2, 154)
  })

  it('fails closed before company lookups when the membership list is oversized', async () => {
    const chatwootClient = createChatwootClientStub({
      companyContactIds: Array.from({ length: 21 }, (_, index) =>
        String(index + 1),
      ).join(','),
    })
    const service = createService({ chatwootClient })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).rejects.toMatchObject({
      code: 'portal_client_company_contact_ids_invalid',
      statusCode: 403,
    })
    expect(chatwootClient.findContactById).toHaveBeenCalledTimes(1)
    expect(chatwootClient.findContactById).toHaveBeenCalledWith(44)
  })

  it('fails closed when a referenced company contact is missing', async () => {
    const chatwootClient = createChatwootClientStub({
      companyContactIds: '999',
    })
    const service = createService({ chatwootClient })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).rejects.toMatchObject({
      code: 'portal_company_contact_missing',
      statusCode: 403,
    })
  })

  it('fails closed when a referenced company contact has the wrong type', async () => {
    const chatwootClient = createChatwootClientStub({
      companyContactOverrides: {
        customAttributes: {
          portal_contact_type: 'person',
          portal_enabled: true,
        },
      },
    })
    const service = createService({ chatwootClient })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).rejects.toMatchObject({
      code: 'portal_company_contact_type_invalid',
      statusCode: 403,
    })
  })

  it('fails closed when a referenced company contact is disabled', async () => {
    const chatwootClient = createChatwootClientStub({
      companyContactOverrides: {
        customAttributes: {
          portal_contact_type: 'company',
          portal_enabled: false,
        },
      },
    })
    const service = createService({ chatwootClient })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).rejects.toMatchObject({
      code: 'portal_company_contact_disabled',
      statusCode: 403,
    })
  })

  it('fails closed before company lookups when the current person contact is disabled', async () => {
    const chatwootClient = createChatwootClientStub({
      companyContactIds: '154',
    })

    chatwootClient.findContactById.mockImplementation(async (contactId) => {
      if (contactId === 44) {
        return {
          customAttributes: {
            portal_client_company_contact_ids: '154',
            portal_contact_type: 'person',
            portal_enabled: false,
          },
          email: 'ivan@example.com',
          id: 44,
          name: 'Иван Петров',
        }
      }

      return null
    })
    const service = createService({ chatwootClient })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).rejects.toMatchObject({
      code: 'portal_contact_disabled',
      statusCode: 403,
    })
    expect(chatwootClient.findContactById).toHaveBeenCalledTimes(1)
    expect(chatwootClient.findContactById).toHaveBeenCalledWith(44)
  })

  it('fails closed before company lookups when the current contact is not a person', async () => {
    const chatwootClient = createChatwootClientStub({
      companyContactIds: '154',
    })

    chatwootClient.findContactById.mockImplementation(async (contactId) => {
      if (contactId === 44) {
        return {
          customAttributes: {
            portal_client_company_contact_ids: '154',
            portal_contact_type: 'company',
            portal_enabled: true,
          },
          email: 'office@romashka.ru',
          id: 44,
          name: 'ООО "Ромашка"',
        }
      }

      return null
    })
    const service = createService({ chatwootClient })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).rejects.toMatchObject({
      code: 'portal_contact_type_invalid',
      statusCode: 403,
    })
    expect(chatwootClient.findContactById).toHaveBeenCalledTimes(1)
    expect(chatwootClient.findContactById).toHaveBeenCalledWith(44)
  })

  it('keeps the private thread available even when no company memberships are configured', async () => {
    const service = createService({
      chatwootClient: createChatwootClientStub({
        companyContactIds: '',
      }),
    })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).resolves.toEqual({
      activeThreadId: 'private:me',
      threads: [
        {
          id: 'private:me',
          subtitle: 'Только вы и поддержка',
          title: 'Личный чат',
          type: 'private',
        },
      ],
    })
  })

  it('uses email lookup and persists a contact link when a portal link does not exist yet', async () => {
    const repository = createRepositoryStub({
      createContactLink: vi.fn().mockResolvedValue({
        chatwootContactId: 44,
        userId: 7,
      }),
      findContactLinkByUserId: vi.fn().mockResolvedValue(null),
    })
    const chatwootClient = createChatwootClientStub()

    chatwootClient.findContactByEmail.mockResolvedValue({
      email: 'ivan@example.com',
      id: 44,
      name: 'Иван Петров',
    })
    const service = createService({ chatwootClient, repository })

    await service.listCurrentUserThreads({ userId: 7 })

    expect(chatwootClient.findContactByEmail).toHaveBeenCalledWith(
      'ivan@example.com',
    )
    expect(repository.createContactLink).toHaveBeenCalledWith({
      chatwootContactId: 44,
      userId: 7,
    })
  })

  it('returns a controlled error when the person contact is missing', async () => {
    const repository = createRepositoryStub({
      findContactLinkByUserId: vi.fn().mockResolvedValue(null),
    })
    const chatwootClient = createChatwootClientStub()

    chatwootClient.findContactByEmail.mockResolvedValue(null)
    const service = createService({ chatwootClient, repository })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).rejects.toMatchObject({
      code: 'portal_contact_missing',
      statusCode: 403,
    })
  })

  it('surfaces configuration ApiErrors without wrapping them', async () => {
    const service = createService({
      chatwootClient: createChatwootClientStub({
        companyContactIds: 'bad',
      }),
    })

    await expect(
      service.listCurrentUserThreads({ userId: 7 }),
    ).rejects.toBeInstanceOf(ApiError)
  })
})
