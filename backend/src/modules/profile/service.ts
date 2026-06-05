import type { ChatwootClient } from '../../integrations/chatwoot/client.js'
import {
  ChatwootClientConfigurationError,
  ChatwootClientRequestError,
} from '../../integrations/chatwoot/client.js'
import { ApiError } from '../../lib/errors.js'
import type { PublicPortalUser } from '../auth/service.js'
import type { FetchAllowedAttachment } from '../chat-messages/attachmentProxy.js'
import { createAttachmentProxyUnavailableError } from '../chat-messages/attachmentProxy.js'
import type { ChatAttachmentProxyResponse } from '../chat-messages/service.js'
import type { ChatThreadContactRepository } from '../chat-threads/contactRepository.js'
import { normalizeProfileAvatarUpload } from './avatarValidation.js'
import type { ProfileAvatarUpload, PublicUserProfile } from './types.js'

type ProfileContactRepository = Pick<
  ChatThreadContactRepository,
  'findContactLinkByUserId'
>

type ProfileChatwootClient = Pick<ChatwootClient, 'findContactById'> &
  Partial<Pick<ChatwootClient, 'updateContactAvatar'>>

type CreateProfileServiceOptions = {
  chatwootClient: ProfileChatwootClient
  contactRepository: ProfileContactRepository
  fetchAllowedAttachment: FetchAllowedAttachment
}

function buildProfileAvatarUrl(hasAvatar: boolean) {
  return hasAvatar ? '/api/profile/avatar' : null
}

function createProfileUnavailable(user: PublicPortalUser): PublicUserProfile {
  return {
    avatarUrl: null,
    email: user.email,
    fullName: user.fullName,
    phoneNumber: null,
    reason: 'contact_unavailable',
    result: 'unavailable',
  }
}

function createProfileUnavailableError() {
  return new ApiError(
    503,
    'profile_unavailable',
    'Профиль временно недоступен. Обратитесь в поддержку.',
  )
}

function createAvatarUpdateUnavailableError() {
  return new ApiError(
    503,
    'profile_avatar_update_unavailable',
    'Не удалось обновить аватар. Попробуйте позже.',
  )
}

function createAvatarUnavailableError(statusCode = 404) {
  return new ApiError(
    statusCode,
    'profile_avatar_unavailable',
    'Файл недоступен.',
  )
}

async function cancelResponseBody(response: Response) {
  try {
    await response.body?.cancel()
  } catch {
    // Best-effort cleanup before returning a controlled proxy error.
  }
}

export function createProfileService({
  chatwootClient,
  contactRepository,
  fetchAllowedAttachment,
}: CreateProfileServiceOptions) {
  async function resolveLinkedContactLink(userId: number) {
    return contactRepository.findContactLinkByUserId(userId)
  }

  async function resolveLinkedContact(userId: number) {
    const link = await resolveLinkedContactLink(userId)

    if (!link) {
      return null
    }

    return chatwootClient.findContactById(link.chatwootContactId)
  }

  return {
    async getCurrentUserProfile({
      user,
    }: {
      user: PublicPortalUser
    }): Promise<PublicUserProfile> {
      try {
        const contact = await resolveLinkedContact(user.id)

        if (!contact) {
          return createProfileUnavailable(user)
        }

        return {
          avatarUrl: buildProfileAvatarUrl(Boolean(contact.avatarUrl?.trim())),
          email: user.email,
          fullName: user.fullName,
          phoneNumber: contact.phoneNumber,
          result: 'ready',
        }
      } catch (error) {
        if (
          error instanceof ChatwootClientConfigurationError ||
          error instanceof ChatwootClientRequestError
        ) {
          return createProfileUnavailable(user)
        }

        throw error
      }
    },

    async getCurrentUserAvatar({
      userId,
    }: {
      userId: number
    }): Promise<ChatAttachmentProxyResponse> {
      try {
        const contact = await resolveLinkedContact(userId)
        const avatarUrl = contact?.avatarUrl?.trim() ?? ''

        if (!avatarUrl) {
          throw createAvatarUnavailableError()
        }

        const headers = new Headers()
        headers.set('accept-encoding', 'identity')

        const response = await fetchAllowedAttachment({
          headers,
          initialUrl: avatarUrl,
        })

        if (!response.ok) {
          await cancelResponseBody(response)
          throw createAttachmentProxyUnavailableError()
        }

        return {
          body: response.body,
          headers: response.headers,
          status: response.status,
        }
      } catch (error) {
        if (error instanceof ApiError) {
          throw error
        }

        if (
          error instanceof ChatwootClientConfigurationError ||
          error instanceof ChatwootClientRequestError
        ) {
          throw createAvatarUnavailableError(503)
        }

        throw error
      }
    },

    async updateCurrentUserAvatar({
      avatar,
      userId,
    }: {
      avatar: ProfileAvatarUpload
      userId: number
    }) {
      const normalizedAvatar = normalizeProfileAvatarUpload(avatar)
      const link = await resolveLinkedContactLink(userId)

      if (!link || !chatwootClient.updateContactAvatar) {
        throw createProfileUnavailableError()
      }

      try {
        const result = await chatwootClient.updateContactAvatar(
          link.chatwootContactId,
          normalizedAvatar,
        )

        if (!result) {
          throw createAvatarUpdateUnavailableError()
        }

        return {
          avatarUrl: '/api/profile/avatar',
          result: 'updated' as const,
        }
      } catch (error) {
        if (error instanceof ApiError) {
          throw error
        }

        if (
          error instanceof ChatwootClientConfigurationError ||
          error instanceof ChatwootClientRequestError
        ) {
          throw createAvatarUpdateUnavailableError()
        }

        throw error
      }
    },
  }
}

export type ProfileService = ReturnType<typeof createProfileService>
