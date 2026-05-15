import type {
  ChatwootClient,
  ChatwootContact,
} from '../../integrations/chatwoot/client.js'
import { ApiError } from '../../lib/errors.js'
import type { ChatContextRepository } from '../chat-context/repository.js'
import {
  assertPortalCompanyContactEnabled,
  assertPortalPersonContactEnabled,
} from './contactAttributes.js'
import { PRIVATE_CHAT_THREAD_ID } from './privateThread.js'

const CONFIGURATION_ERROR_MESSAGE =
  'Доступ к порталу настроен некорректно. Обратитесь в поддержку.'

type ChatThreadsRepository = Pick<
  ChatContextRepository,
  'createContactLink' | 'findContactLinkByUserId' | 'findPortalUserById'
>

type ChatThreadsChatwootClient = Pick<
  ChatwootClient,
  'findContactByEmail' | 'findContactById'
>

export type PublicChatThreadSummary =
  | {
      id: typeof PRIVATE_CHAT_THREAD_ID
      subtitle: string
      title: string
      type: 'private'
    }
  | {
      id: `company:${number}`
      subtitle: string
      title: string
      type: 'company'
    }

export type CurrentUserChatThreads = {
  activeThreadId: typeof PRIVATE_CHAT_THREAD_ID
  threads: PublicChatThreadSummary[]
}

type CreateChatThreadsServiceOptions = {
  chatContextRepository: ChatThreadsRepository
  chatwootClient: ChatThreadsChatwootClient
}

function createContactConfigurationError(code: string) {
  return new ApiError(403, code, CONFIGURATION_ERROR_MESSAGE)
}

function buildPrivateThread(): PublicChatThreadSummary {
  return {
    id: PRIVATE_CHAT_THREAD_ID,
    subtitle: 'Только вы и поддержка',
    title: 'Личный чат',
    type: 'private',
  }
}

function buildCompanyThread(contact: ChatwootContact): PublicChatThreadSummary {
  return {
    id: `company:${contact.id}`,
    subtitle: 'Общий чат компании',
    title: contact.name?.trim() || `Компания ${contact.id}`,
    type: 'company',
  }
}

export function createChatThreadsService({
  chatContextRepository,
  chatwootClient,
}: CreateChatThreadsServiceOptions) {
  async function findLinkedPersonContact(userId: number) {
    const contactLink =
      await chatContextRepository.findContactLinkByUserId(userId)

    if (contactLink) {
      const contact = await chatwootClient.findContactById(
        contactLink.chatwootContactId,
      )

      if (!contact) {
        throw createContactConfigurationError('portal_contact_missing')
      }

      return contact
    }

    const portalUser = await chatContextRepository.findPortalUserById(userId)

    if (!portalUser) {
      throw createContactConfigurationError('portal_contact_missing')
    }

    const contact = await chatwootClient.findContactByEmail(portalUser.email)

    if (!contact) {
      throw createContactConfigurationError('portal_contact_missing')
    }

    const persistedLink = await chatContextRepository.createContactLink({
      chatwootContactId: contact.id,
      userId,
    })

    if (!persistedLink || persistedLink.chatwootContactId !== contact.id) {
      throw createContactConfigurationError('portal_contact_missing')
    }

    const refreshedContact = await chatwootClient.findContactById(contact.id)

    if (!refreshedContact) {
      throw createContactConfigurationError('portal_contact_missing')
    }

    return refreshedContact
  }

  return {
    async listCurrentUserThreads({
      userId,
    }: {
      userId: number
    }): Promise<CurrentUserChatThreads> {
      const personContact = await findLinkedPersonContact(userId)
      const personAttributes = assertPortalPersonContactEnabled(personContact)
      const threads: PublicChatThreadSummary[] = [buildPrivateThread()]

      for (const companyContactId of personAttributes.companyContactIds) {
        const companyContact =
          await chatwootClient.findContactById(companyContactId)

        if (!companyContact) {
          throw createContactConfigurationError(
            'portal_company_contact_missing',
          )
        }

        assertPortalCompanyContactEnabled(companyContact)
        threads.push(buildCompanyThread(companyContact))
      }

      return {
        activeThreadId: PRIVATE_CHAT_THREAD_ID,
        threads,
      }
    },
  }
}

export type ChatThreadsService = ReturnType<typeof createChatThreadsService>
