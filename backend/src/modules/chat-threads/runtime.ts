import { randomUUID } from 'node:crypto'

import type {
  ChatwootClient,
  ChatwootConversation,
  ChatwootContact,
} from '../../integrations/chatwoot/client.js'
import { ChatwootClientRequestError } from '../../integrations/chatwoot/client.js'
import { ApiError } from '../../lib/errors.js'
import { assertPortalGroupContactEnabled } from './contactAttributes.js'
import type { ChatThreadsRepository } from './repository.js'
import {
  buildContextFromThreadRecord,
  buildThreadContext,
  createUnavailableRuntimeContext,
  mapChatwootConversation,
  mapPersistedThreadConversation,
  parseRuntimeThreadId,
} from './runtimeContext.js'
import {
  buildGroupThread,
  buildPrivateThread,
  type CurrentUserChatThreadContext,
} from './types.js'

type ChatThreadRuntimeRepository = Pick<
  ChatThreadsRepository,
  | 'findThreadById'
  | 'transactionWithThreadBootstrapLock'
  | 'updateThreadConversation'
  | 'upsertGroupThread'
  | 'upsertPrivateThread'
>

type ChatThreadRuntimeChatwootClient = Pick<
  ChatwootClient,
  | 'createContactInbox'
  | 'createConversation'
  | 'findContactById'
  | 'findContactPortalInboxSourceId'
>

type PersonAttributes = {
  groupContactIds: number[]
}

type CreateChatThreadRuntimeResolverOptions = {
  chatThreadsRepository: ChatThreadRuntimeRepository
  chatwootClient: ChatThreadRuntimeChatwootClient
  findLinkedPersonContact: (userId: number) => Promise<ChatwootContact>
  now?: () => Date
  portalInboxId: number
  readPersonAttributes: (contact: ChatwootContact) => PersonAttributes
}

export function createChatThreadRuntimeResolver({
  chatThreadsRepository,
  chatwootClient,
  findLinkedPersonContact,
  now = () => new Date(),
  portalInboxId,
  readPersonAttributes,
}: CreateChatThreadRuntimeResolverOptions) {
  async function resolveCurrentUserThread({
    threadId,
    userId,
  }: {
    threadId: string
    userId: number
  }) {
    const parsedThread = parseRuntimeThreadId(threadId)

    if (!parsedThread) {
      return buildThreadContext({
        activeThread: null,
        chatwootConversation: null,
        currentUserEmail: null,
        currentUserName: null,
        linkedContactId: null,
        portalChatThreadId: null,
        reason: 'thread_invalid',
        result: 'not_ready',
        targetChatwootContactId: null,
        threadType: null,
      })
    }

    let personContact: ChatwootContact

    try {
      personContact = await findLinkedPersonContact(userId)
    } catch (error) {
      return createUnavailableRuntimeContext({
        activeThread: null,
        error,
        linkedContactId: null,
        portalChatThreadId: null,
        targetChatwootContactId: null,
        threadType: parsedThread.type,
      })
    }

    const personAttributes = readPersonAttributes(personContact)
    const refreshedAt = now()

    if (parsedThread.type === 'private') {
      const threadRecord = await chatThreadsRepository.upsertPrivateThread({
        chatwootContactId: personContact.id,
        chatwootInboxId: portalInboxId,
        now: refreshedAt,
        userId,
      })

      return buildContextFromThreadRecord({
        activeThread: buildPrivateThread(),
        linkedContactId: personContact.id,
        threadRecord,
        userContact: personContact,
      })
    }

    if (
      !personAttributes.groupContactIds.includes(
        parsedThread.chatwootGroupContactId,
      )
    ) {
      return buildThreadContext({
        activeThread: null,
        chatwootConversation: null,
        currentUserEmail: personContact.email,
        currentUserName: personContact.name,
        linkedContactId: personContact.id,
        portalChatThreadId: null,
        reason: 'thread_access_denied',
        result: 'not_ready',
        targetChatwootContactId: parsedThread.chatwootGroupContactId,
        threadType: 'group',
      })
    }

    const groupContact = await chatwootClient.findContactById(
      parsedThread.chatwootGroupContactId,
    )

    if (!groupContact) {
      return buildThreadContext({
        activeThread: null,
        chatwootConversation: null,
        currentUserEmail: personContact.email,
        currentUserName: personContact.name,
        linkedContactId: personContact.id,
        portalChatThreadId: null,
        reason: 'thread_access_denied',
        result: 'not_ready',
        targetChatwootContactId: parsedThread.chatwootGroupContactId,
        threadType: 'group',
      })
    }

    try {
      assertPortalGroupContactEnabled(groupContact)
    } catch (error) {
      if (error instanceof ApiError) {
        return buildThreadContext({
          activeThread: null,
          chatwootConversation: null,
          currentUserEmail: personContact.email,
          currentUserName: personContact.name,
          linkedContactId: personContact.id,
          portalChatThreadId: null,
          reason: 'thread_access_denied',
          result: 'not_ready',
          targetChatwootContactId: groupContact.id,
          threadType: 'group',
        })
      }

      throw error
    }

    const threadRecord = await chatThreadsRepository.upsertGroupThread({
      chatwootContactId: groupContact.id,
      chatwootInboxId: portalInboxId,
      now: refreshedAt,
    })

    return buildContextFromThreadRecord({
      activeThread: buildGroupThread(groupContact),
      linkedContactId: personContact.id,
      threadRecord,
      userContact: personContact,
    })
  }

  async function ensurePortalContactInboxSourceId(contactId: number) {
    const currentSourceId =
      await chatwootClient.findContactPortalInboxSourceId(contactId)

    if (currentSourceId) {
      return currentSourceId
    }

    try {
      const createdContactInbox = await chatwootClient.createContactInbox({
        contactId,
        sourceId: `portal-contact:${randomUUID()}`,
      })

      return createdContactInbox.sourceId
    } catch (error) {
      if (error instanceof ChatwootClientRequestError) {
        return chatwootClient.findContactPortalInboxSourceId(contactId)
      }

      throw error
    }
  }

  async function bootstrapThreadConversation(
    context: CurrentUserChatThreadContext,
    {
      staleConversationId = null,
    }: {
      staleConversationId?: number | null
    } = {},
  ): Promise<CurrentUserChatThreadContext> {
    const activeThread = context.activeThread
    const portalChatThreadId = context.portalChatThreadId
    const targetChatwootContactId = context.targetChatwootContactId

    if (
      !activeThread ||
      portalChatThreadId === null ||
      targetChatwootContactId === null
    ) {
      return context
    }

    return chatThreadsRepository.transactionWithThreadBootstrapLock(
      targetChatwootContactId,
      async () => {
        const lockedThread =
          await chatThreadsRepository.findThreadById(portalChatThreadId)

        if (!lockedThread) {
          return buildThreadContext({
            ...context,
            chatwootConversation: null,
            reason: 'conversation_mapping_unavailable',
            result: 'unavailable',
          })
        }
        const lockedConversation = mapPersistedThreadConversation(lockedThread)

        if (
          staleConversationId !== null &&
          lockedThread.chatwootConversationId !== staleConversationId
        ) {
          const recoveredConversation =
            mapPersistedThreadConversation(lockedThread)

          if (recoveredConversation) {
            return buildThreadContext({
              ...context,
              chatwootConversation: recoveredConversation,
              portalChatThreadId: lockedThread.id,
              reason: 'none',
              result: 'ready',
            })
          }
        }

        if (lockedConversation && staleConversationId === null) {
          return buildThreadContext({
            ...context,
            chatwootConversation: lockedConversation,
            reason: 'none',
            result: 'ready',
          })
        }

        let sourceId: string | null

        try {
          sourceId = await ensurePortalContactInboxSourceId(
            targetChatwootContactId,
          )
        } catch (error) {
          return createUnavailableRuntimeContext({
            activeThread,
            currentUserEmail: context.currentUserEmail,
            currentUserName: context.currentUserName,
            error,
            linkedContactId: context.linkedContactId,
            portalChatThreadId,
            targetChatwootContactId,
            threadType: context.threadType,
          })
        }

        if (!sourceId) {
          return context
        }

        let conversation: ChatwootConversation

        try {
          conversation = await chatwootClient.createConversation({
            contactId: targetChatwootContactId,
            sourceId,
          })
        } catch (error) {
          return createUnavailableRuntimeContext({
            activeThread,
            currentUserEmail: context.currentUserEmail,
            currentUserName: context.currentUserName,
            error,
            linkedContactId: context.linkedContactId,
            portalChatThreadId,
            targetChatwootContactId,
            threadType: context.threadType,
          })
        }

        const updatedThread =
          await chatThreadsRepository.updateThreadConversation({
            chatwootConversationId: conversation.id,
            chatwootInboxId: conversation.inboxId,
            id: lockedThread.id,
            now: now(),
          })

        if (!updatedThread) {
          return buildThreadContext({
            ...context,
            chatwootConversation: null,
            reason: 'conversation_mapping_unavailable',
            result: 'unavailable',
          })
        }

        return buildThreadContext({
          ...context,
          chatwootConversation: mapChatwootConversation(conversation),
          portalChatThreadId: updatedThread.id,
          reason: 'none',
          result: 'ready',
        })
      },
    )
  }

  return {
    async ensureCurrentUserWritableThreadContext({
      threadId,
      userId,
    }: {
      threadId: string
      userId: number
    }): Promise<CurrentUserChatThreadContext> {
      const context = await resolveCurrentUserThread({
        threadId,
        userId,
      })

      if (context.result === 'ready') {
        return context
      }

      if (
        context.result === 'not_ready' &&
        context.reason === 'conversation_missing'
      ) {
        return bootstrapThreadConversation(context)
      }

      return context
    },

    async recoverCurrentUserWritableThreadContext({
      staleConversationId,
      threadId,
      userId,
    }: {
      staleConversationId: number
      threadId: string
      userId: number
    }): Promise<CurrentUserChatThreadContext> {
      const context = await resolveCurrentUserThread({
        threadId,
        userId,
      })

      if (
        context.result === 'ready' &&
        context.chatwootConversation?.id === staleConversationId
      ) {
        return bootstrapThreadConversation(context, {
          staleConversationId,
        })
      }

      if (
        context.result === 'not_ready' &&
        context.reason === 'conversation_missing'
      ) {
        return bootstrapThreadConversation(context)
      }

      return context
    },

    async getCurrentUserThreadContext({
      threadId,
      userId,
    }: {
      threadId: string
      userId: number
    }): Promise<CurrentUserChatThreadContext> {
      return resolveCurrentUserThread({
        threadId,
        userId,
      })
    },
  }
}
