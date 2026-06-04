import type { ChatwootClient } from '../../integrations/chatwoot/client.js'
import { ApiError } from '../../lib/errors.js'
import type { ChatUnreadService } from '../chat-unread/service.js'
import {
  assertPortalGroupContactEnabled,
  assertPortalPersonContactEnabled,
} from './contactAttributes.js'
import type { ChatThreadContactRepository } from './contactRepository.js'
import {
  buildChatThreadAccessLabel,
  buildChatThreadTypeLabel,
  normalizeChatInfoParticipantRows,
  readCuratorName,
  toIsoDateTime,
  type SafeChatInfoParticipantRow,
} from './info.js'
import { PRIVATE_CHAT_THREAD_ID } from './privateThread.js'
import type { ChatThreadsRepository as PortalChatThreadsRepository } from './repository.js'
import { createChatThreadRuntimeResolver } from './runtime.js'
import {
  buildGroupThread,
  buildPrivateThread,
  type CurrentUserChatThreads,
  type PublicChatThreadListSummary,
  type PublicChatThreadSummary,
} from './types.js'

const CONFIGURATION_ERROR_MESSAGE =
  'Доступ к порталу настроен некорректно. Обратитесь в поддержку.'

type ChatThreadsContactRepository = Pick<
  ChatThreadContactRepository,
  | 'createContactLink'
  | 'findContactLinkByUserId'
  | 'findPortalUserById'
  | 'listActivePortalUserContactLinks'
>

type ChatThreadsPersistenceRepository = Pick<
  PortalChatThreadsRepository,
  | 'findThreadById'
  | 'transactionWithThreadBootstrapLock'
  | 'updateThreadConversation'
  | 'updateThreadContactSourceId'
  | 'upsertGroupThread'
  | 'upsertPrivateThread'
>

type ChatThreadsChatwootClient = Pick<
  ChatwootClient,
  | 'createContactInbox'
  | 'createConversation'
  | 'findContactByEmail'
  | 'findContactById'
  | 'findContactPortalInboxSourceId'
  | 'listContactConversations'
>

type CreateChatThreadsServiceOptions = {
  chatUnreadService?: Pick<ChatUnreadService, 'countUnreadByThread'>
  contactRepository: ChatThreadsContactRepository
  chatThreadsRepository: ChatThreadsPersistenceRepository
  chatwootClient: ChatThreadsChatwootClient
  now?: () => Date
  portalInboxId: number
  supportLabel?: string
}

function createContactConfigurationError(code: string) {
  return new ApiError(403, code, CONFIGURATION_ERROR_MESSAGE)
}

function isSkippableGroupListConfigurationError(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.code === 'portal_group_contact_disabled' ||
      error.code === 'portal_group_contact_type_invalid' ||
      error.code === 'portal_contact_disabled' ||
      error.code === 'portal_contact_type_invalid')
  )
}

export function createChatThreadsService({
  chatUnreadService,
  contactRepository,
  chatThreadsRepository,
  chatwootClient,
  now = () => new Date(),
  portalInboxId,
  supportLabel = 'Команда поддержки',
}: CreateChatThreadsServiceOptions) {
  async function findLinkedPersonContact(userId: number) {
    const contactLink = await contactRepository.findContactLinkByUserId(userId)

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

  async function addUnreadCounts({
    threads,
    userId,
  }: {
    threads: PublicChatThreadSummary[]
    userId: number
  }) {
    if (threads.length === 0) {
      return {
        threads: [] as PublicChatThreadListSummary[],
        totalUnreadCount: 0,
      }
    }

    const unreadCounts = chatUnreadService
      ? await chatUnreadService.countUnreadByThread({
          portalUserId: userId,
          threadIds: threads.map((thread) => thread.id),
        })
      : new Map<string, number>()
    let totalUnreadCount = 0
    const threadsWithUnreadCounts = threads.map((thread) => {
      const unreadCount = unreadCounts.get(thread.id) ?? 0
      totalUnreadCount += unreadCount

      return {
        ...thread,
        unreadCount,
      }
    })

    return {
      threads: threadsWithUnreadCounts,
      totalUnreadCount,
    }
  }

  async function listSafeGroupParticipants({
    currentUserId,
    groupContactId,
  }: {
    currentUserId: number
    groupContactId: number
  }) {
    const rows = await contactRepository.listActivePortalUserContactLinks()
    const participantRows: SafeChatInfoParticipantRow[] = []

    for (const row of rows) {
      const contact = await chatwootClient.findContactById(
        row.chatwootContactId,
      )

      if (!contact) {
        continue
      }

      let attributes: ReturnType<typeof assertPortalPersonContactEnabled>

      try {
        attributes = assertPortalPersonContactEnabled(contact)
      } catch {
        continue
      }

      if (!attributes.groupContactIds.includes(groupContactId)) {
        continue
      }

      participantRows.push({
        displayName: row.fullName,
        email: row.email,
        isCurrentUser: row.userId === currentUserId,
        userId: row.userId,
      })
    }

    return normalizeChatInfoParticipantRows(participantRows)
  }

  return {
    ...runtimeResolver,

    async getCurrentUserThreadInfo({
      threadId,
      userId,
    }: {
      threadId: string
      userId: number
    }) {
      const context = await runtimeResolver.getCurrentUserThreadContext({
        threadId,
        userId,
      })

      if (!context.activeThread || !context.threadType) {
        return {
          accessLabel: '',
          activeThread: null,
          curatorName: null,
          lastActivityAt: null,
          participants: [],
          reason: context.reason,
          result: context.result,
          startedAt: null,
          supportLabel,
          threadTypeLabel: null,
        }
      }

      const targetContact =
        context.targetChatwootContactId === null
          ? null
          : await chatwootClient.findContactById(
              context.targetChatwootContactId,
            )
      const conversations =
        context.chatwootConversation && context.targetChatwootContactId !== null
          ? await chatwootClient.listContactConversations(
              context.targetChatwootContactId,
            )
          : []
      const conversation =
        context.chatwootConversation === null
          ? null
          : (conversations.find(
              (candidate) => candidate.id === context.chatwootConversation?.id,
            ) ?? null)
      const participants =
        context.threadType === 'group' &&
        context.targetChatwootContactId !== null
          ? await listSafeGroupParticipants({
              currentUserId: userId,
              groupContactId: context.targetChatwootContactId,
            })
          : []

      return {
        accessLabel: buildChatThreadAccessLabel(context.threadType),
        activeThread: context.activeThread,
        curatorName: readCuratorName(targetContact?.customAttributes),
        lastActivityAt: toIsoDateTime(conversation?.lastActivityAt ?? null),
        participants,
        reason: context.reason,
        result:
          context.result === 'unavailable'
            ? 'unavailable'
            : context.activeThread
              ? 'ready'
              : context.result,
        startedAt: toIsoDateTime(conversation?.createdAt ?? null),
        supportLabel,
        threadTypeLabel: buildChatThreadTypeLabel(context.threadType),
      }
    },

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

      for (const groupContactId of personAttributes.groupContactIds) {
        const groupContact =
          await chatwootClient.findContactById(groupContactId)

        if (!groupContact) {
          continue
        }

        try {
          assertPortalGroupContactEnabled(groupContact)
        } catch (error) {
          if (isSkippableGroupListConfigurationError(error)) {
            continue
          }

          throw error
        }

        await chatThreadsRepository.upsertGroupThread({
          chatwootContactId: groupContact.id,
          chatwootInboxId: portalInboxId,
          now: refreshedAt,
        })

        threads.push(buildGroupThread(groupContact))
      }

      const unread = await addUnreadCounts({
        threads,
        userId,
      })

      return {
        activeThreadId: PRIVATE_CHAT_THREAD_ID,
        threads: unread.threads,
        totalUnreadCount: unread.totalUnreadCount,
      }
    },
  }
}

export type ChatThreadsService = ReturnType<typeof createChatThreadsService>
