import type { ChatwootClient } from '../../integrations/chatwoot/client.js'
import { ApiError } from '../../lib/errors.js'
import {
  assertPortalCompanyContactEnabled,
  assertPortalPersonContactEnabled,
} from './contactAttributes.js'
import type { ChatThreadContactRepository } from './contactRepository.js'
import { PRIVATE_CHAT_THREAD_ID } from './privateThread.js'
import type { ChatThreadsRepository as PortalChatThreadsRepository } from './repository.js'
import { createChatThreadRuntimeResolver } from './runtime.js'
import {
  buildCompanyThread,
  buildPrivateThread,
  type CurrentUserChatThreads,
  type PublicChatThreadSummary,
} from './types.js'

const CONFIGURATION_ERROR_MESSAGE =
  'Доступ к порталу настроен некорректно. Обратитесь в поддержку.'

type ChatThreadsContactRepository = Pick<
  ChatThreadContactRepository,
  'createContactLink' | 'findContactLinkByUserId' | 'findPortalUserById'
>

type ChatThreadsPersistenceRepository = Pick<
  PortalChatThreadsRepository,
  | 'findThreadById'
  | 'transactionWithThreadBootstrapLock'
  | 'updateThreadConversation'
  | 'upsertCompanyThread'
  | 'upsertPrivateThread'
>

type ChatThreadsChatwootClient = Pick<
  ChatwootClient,
  | 'createContactInbox'
  | 'createConversation'
  | 'findContactByEmail'
  | 'findContactById'
  | 'findContactPortalInboxSourceId'
>

type CreateChatThreadsServiceOptions = {
  contactRepository: ChatThreadsContactRepository
  chatThreadsRepository: ChatThreadsPersistenceRepository
  chatwootClient: ChatThreadsChatwootClient
  now?: () => Date
  portalInboxId: number
}

function createContactConfigurationError(code: string) {
  return new ApiError(403, code, CONFIGURATION_ERROR_MESSAGE)
}

export function createChatThreadsService({
  contactRepository,
  chatThreadsRepository,
  chatwootClient,
  now = () => new Date(),
  portalInboxId,
}: CreateChatThreadsServiceOptions) {
  async function findLinkedPersonContact(userId: number) {
    const contactLink =
      await contactRepository.findContactLinkByUserId(userId)

    if (contactLink) {
      const contact = await chatwootClient.findContactById(
        contactLink.chatwootContactId,
      )

      if (!contact) {
        throw createContactConfigurationError('portal_contact_missing')
      }

      return contact
    }

    const portalUser = await contactRepository.findPortalUserById(userId)

    if (!portalUser) {
      throw createContactConfigurationError('portal_contact_missing')
    }

    const contact = await chatwootClient.findContactByEmail(portalUser.email)

    if (!contact) {
      throw createContactConfigurationError('portal_contact_missing')
    }

    const persistedLink = await contactRepository.createContactLink({
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
  const runtimeResolver = createChatThreadRuntimeResolver({
    chatThreadsRepository,
    chatwootClient,
    findLinkedPersonContact,
    now,
    portalInboxId,
    readPersonAttributes: assertPortalPersonContactEnabled,
  })

  return {
    ...runtimeResolver,

    async listCurrentUserThreads({
      userId,
    }: {
      userId: number
    }): Promise<CurrentUserChatThreads> {
      const personContact = await findLinkedPersonContact(userId)
      const personAttributes = assertPortalPersonContactEnabled(personContact)
      const refreshedAt = now()
      const threads: PublicChatThreadSummary[] = [buildPrivateThread()]

      await chatThreadsRepository.upsertPrivateThread({
        chatwootContactId: personContact.id,
        chatwootInboxId: portalInboxId,
        now: refreshedAt,
        userId,
      })

      for (const companyContactId of personAttributes.companyContactIds) {
        const companyContact =
          await chatwootClient.findContactById(companyContactId)

        if (!companyContact) {
          throw createContactConfigurationError(
            'portal_company_contact_missing',
          )
        }

        assertPortalCompanyContactEnabled(companyContact)

        await chatThreadsRepository.upsertCompanyThread({
          chatwootContactId: companyContact.id,
          chatwootInboxId: portalInboxId,
          now: refreshedAt,
        })

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
