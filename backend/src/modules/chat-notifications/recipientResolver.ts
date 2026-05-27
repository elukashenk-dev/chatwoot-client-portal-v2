import type {
  ChatwootClient,
  ChatwootContact,
} from '../../integrations/chatwoot/client.js'
import {
  assertPortalGroupContactEnabled,
  assertPortalPersonContactEnabled,
} from '../chat-threads/contactAttributes.js'
import type { ChatThreadContactRepository } from '../chat-threads/contactRepository.js'
import type { ChatThreadsRepository } from '../chat-threads/repository.js'
import { buildPrivateThread } from '../chat-threads/types.js'
import type { ChatwootConversationThreadMapping } from '../chatwoot-webhooks/repository.js'

const GROUP_RECIPIENT_LOOKUP_BATCH_SIZE = 5

type RecipientResolverContactRepository = Pick<
  ChatThreadContactRepository,
  'findPortalUserById' | 'listActivePortalUserContactLinks'
>

type RecipientResolverThreadRepository = Pick<
  ChatThreadsRepository,
  'findSendLedgerAuthorsByMessageIds'
>

type RecipientResolverChatwootClient = Pick<ChatwootClient, 'findContactById'>

export type PushRecipient = {
  portalChatThreadId: number
  portalUserId: number
  threadId: string
  threadTitle: string | null
  threadType: 'group' | 'private' | null
}

type CreateChatNotificationRecipientResolverOptions = {
  chatThreadsRepository: RecipientResolverThreadRepository
  chatwootClient: RecipientResolverChatwootClient
  contactRepository: RecipientResolverContactRepository
}

function readGroupContactId(threadId: string) {
  const match = /^group:(\d+)$/.exec(threadId)

  if (!match) {
    return null
  }

  return Number(match[1])
}

async function mapWithConcurrencyLimit<TInput, TOutput>(
  items: TInput[],
  batchSize: number,
  mapper: (item: TInput) => Promise<TOutput>,
) {
  const results: TOutput[] = []

  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize)
    results.push(...(await Promise.all(batch.map(mapper))))
  }

  return results
}

function canReceiveGroupPush({
  contact,
  groupContactId,
}: {
  contact: ChatwootContact
  groupContactId: number
}) {
  try {
    const attributes = assertPortalPersonContactEnabled(contact)

    return attributes.groupContactIds.includes(groupContactId)
  } catch {
    return false
  }
}

function buildGroupPushThreadTitle(contact: ChatwootContact) {
  const title = contact.name?.trim()

  return title ? title.slice(0, 120) : null
}

export function createChatNotificationRecipientResolver({
  chatThreadsRepository,
  chatwootClient,
  contactRepository,
}: CreateChatNotificationRecipientResolverOptions) {
  return {
    async resolveRecipients({
      chatwootMessageId,
      threadMapping,
    }: {
      chatwootMessageId: number
      threadMapping: ChatwootConversationThreadMapping
    }): Promise<PushRecipient[]> {
      const authorLedger =
        await chatThreadsRepository.findSendLedgerAuthorsByMessageIds({
          messageIds: [chatwootMessageId],
          portalChatThreadId: threadMapping.portalChatThreadId,
        })
      const author = authorLedger.get(chatwootMessageId) ?? null

      if (threadMapping.threadType === 'private') {
        if (!threadMapping.userId || author?.userId === threadMapping.userId) {
          return []
        }

        const user = await contactRepository.findPortalUserById(
          threadMapping.userId,
        )

        if (!user) {
          return []
        }

        const privateThread = buildPrivateThread()

        return [
          {
            portalChatThreadId: threadMapping.portalChatThreadId,
            portalUserId: threadMapping.userId,
            threadId: threadMapping.threadId,
            threadTitle: privateThread.title,
            threadType: privateThread.type,
          },
        ]
      }

      const groupContactId = readGroupContactId(threadMapping.threadId)

      if (!groupContactId) {
        return []
      }

      const groupContact = await chatwootClient.findContactById(groupContactId)

      if (!groupContact) {
        return []
      }

      try {
        assertPortalGroupContactEnabled(groupContact)
      } catch {
        return []
      }

      const groupThreadTitle = buildGroupPushThreadTitle(groupContact)
      const links = await contactRepository.listActivePortalUserContactLinks()
      const recipients = await mapWithConcurrencyLimit(
        links,
        GROUP_RECIPIENT_LOOKUP_BATCH_SIZE,
        async (link): Promise<PushRecipient | null> => {
          if (author?.userId === link.userId) {
            return null
          }

          let contact: ChatwootContact | null

          try {
            contact = await chatwootClient.findContactById(
              link.chatwootContactId,
            )
          } catch {
            return null
          }

          if (
            !contact ||
            !canReceiveGroupPush({
              contact,
              groupContactId,
            })
          ) {
            return null
          }

          return {
            portalChatThreadId: threadMapping.portalChatThreadId,
            portalUserId: link.userId,
            threadId: threadMapping.threadId,
            threadTitle: groupThreadTitle,
            threadType: 'group',
          }
        },
      )

      return recipients.filter((recipient) => recipient !== null)
    },
  }
}

export type ChatNotificationRecipientResolver = ReturnType<
  typeof createChatNotificationRecipientResolver
>
