import { randomUUID } from 'node:crypto'

import type {
  ChatwootClient,
  ChatwootConversation,
  ChatwootContact,
} from '../../integrations/chatwoot/client.js'
import {
  ChatwootClientConfigurationError,
  ChatwootClientRequestError,
} from '../../integrations/chatwoot/client.js'
import { ApiError } from '../../lib/errors.js'
import { assertPortalCompanyContactEnabled } from './contactAttributes.js'
import type {
  ChatThreadsRepository,
  PortalChatThreadRecord,
} from './repository.js'
import { parsePublicChatThreadId } from './threadResolver.js'
import {
  buildCompanyThread,
  buildPrivateThread,
  type ChatThreadRuntimeConversation,
  type CurrentUserChatThreadContext,
  type PublicChatThreadSummary,
} from './types.js'

type ChatThreadRuntimeRepository = Pick<
  ChatThreadsRepository,
  | 'findThreadById'
  | 'transactionWithThreadBootstrapLock'
  | 'updateThreadConversation'
  | 'upsertCompanyThread'
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
  companyContactIds: number[]
}

type CreateChatThreadRuntimeResolverOptions = {
  chatThreadsRepository: ChatThreadRuntimeRepository
  chatwootClient: ChatThreadRuntimeChatwootClient
  findLinkedPersonContact: (userId: number) => Promise<ChatwootContact>
  now?: () => Date
  portalInboxId: number
  readPersonAttributes: (contact: ChatwootContact) => PersonAttributes
}

function buildThreadContext({
  activeThread = null,
  chatwootConversation = null,
  linkedContactId = null,
  portalChatThreadId = null,
  reason,
  result,
  targetChatwootContactId = null,
  threadType = null,
}: CurrentUserChatThreadContext): CurrentUserChatThreadContext {
  return {
    activeThread,
    chatwootConversation,
    linkedContactId,
    portalChatThreadId,
    reason,
    result,
    targetChatwootContactId,
    threadType,
  }
}

function mapChatwootConversation(
  conversation: ChatwootConversation,
): ChatThreadRuntimeConversation {
  return {
    assigneeName: conversation.assigneeName,
    id: conversation.id,
    inboxId: conversation.inboxId,
    lastActivityAt: conversation.lastActivityAt,
    status: conversation.status,
  }
}

function mapPersistedThreadConversation(
  thread: PortalChatThreadRecord,
): ChatThreadRuntimeConversation | null {
  if (thread.chatwootConversationId === null) {
    return null
  }

  return {
    assigneeName: null,
    id: thread.chatwootConversationId,
    inboxId: thread.chatwootInboxId,
    lastActivityAt: null,
    status: 'open',
  }
}

function parseRuntimeThreadId(threadId: string) {
  try {
    return parsePublicChatThreadId(threadId)
  } catch (error) {
    if (error instanceof ApiError && error.code === 'chat_thread_unsupported') {
      return null
    }

    throw error
  }
}

function createUnavailableRuntimeContext({
  activeThread,
  error,
  linkedContactId,
  portalChatThreadId,
  targetChatwootContactId,
  threadType,
}: {
  activeThread: PublicChatThreadSummary | null
  error: unknown
  linkedContactId: number | null
  portalChatThreadId: number | null
  targetChatwootContactId: number | null
  threadType: 'company' | 'private' | null
}) {
  if (error instanceof ChatwootClientConfigurationError) {
    return buildThreadContext({
      activeThread,
      chatwootConversation: null,
      linkedContactId,
      portalChatThreadId,
      reason: 'chatwoot_not_configured',
      result: 'unavailable',
      targetChatwootContactId,
      threadType,
    })
  }

  if (error instanceof ChatwootClientRequestError) {
    return buildThreadContext({
      activeThread,
      chatwootConversation: null,
      linkedContactId,
      portalChatThreadId,
      reason: 'chatwoot_unavailable',
      result: 'unavailable',
      targetChatwootContactId,
      threadType,
    })
  }

  throw error
}

function buildContextFromThreadRecord({
  activeThread,
  linkedContactId,
  threadRecord,
}: {
  activeThread: PublicChatThreadSummary
  linkedContactId: number
  threadRecord: PortalChatThreadRecord
}) {
  const chatwootConversation = mapPersistedThreadConversation(threadRecord)

  return buildThreadContext({
    activeThread,
    chatwootConversation,
    linkedContactId,
    portalChatThreadId: threadRecord.id,
    reason: chatwootConversation ? 'none' : 'conversation_missing',
    result: chatwootConversation ? 'ready' : 'not_ready',
    targetChatwootContactId: threadRecord.chatwootContactId,
    threadType: threadRecord.threadType,
  })
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
        linkedContactId: null,
        portalChatThreadId: null,
        reason: 'thread_invalid',
        result: 'not_ready',
        targetChatwootContactId: null,
        threadType: null,
      })
    }

    const personContact = await findLinkedPersonContact(userId)
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
      })
    }

    if (
      !personAttributes.companyContactIds.includes(
        parsedThread.chatwootCompanyContactId,
      )
    ) {
      return buildThreadContext({
        activeThread: null,
        chatwootConversation: null,
        linkedContactId: personContact.id,
        portalChatThreadId: null,
        reason: 'thread_access_denied',
        result: 'not_ready',
        targetChatwootContactId: parsedThread.chatwootCompanyContactId,
        threadType: 'company',
      })
    }

    const companyContact = await chatwootClient.findContactById(
      parsedThread.chatwootCompanyContactId,
    )

    if (!companyContact) {
      return buildThreadContext({
        activeThread: null,
        chatwootConversation: null,
        linkedContactId: personContact.id,
        portalChatThreadId: null,
        reason: 'thread_access_denied',
        result: 'not_ready',
        targetChatwootContactId: parsedThread.chatwootCompanyContactId,
        threadType: 'company',
      })
    }

    try {
      assertPortalCompanyContactEnabled(companyContact)
    } catch (error) {
      if (error instanceof ApiError) {
        return buildThreadContext({
          activeThread: null,
          chatwootConversation: null,
          linkedContactId: personContact.id,
          portalChatThreadId: null,
          reason: 'thread_access_denied',
          result: 'not_ready',
          targetChatwootContactId: companyContact.id,
          threadType: 'company',
        })
      }

      throw error
    }

    const threadRecord = await chatThreadsRepository.upsertCompanyThread({
      chatwootContactId: companyContact.id,
      chatwootInboxId: portalInboxId,
      now: refreshedAt,
    })

    return buildContextFromThreadRecord({
      activeThread: buildCompanyThread(companyContact),
      linkedContactId: personContact.id,
      threadRecord,
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

        if (lockedConversation) {
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
