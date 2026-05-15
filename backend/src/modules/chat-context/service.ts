import { randomUUID } from 'node:crypto'

import type {
  ChatwootClient,
  ChatwootConversation,
} from '../../integrations/chatwoot/client.js'
import {
  ChatwootClientConfigurationError,
  ChatwootClientRequestError,
} from '../../integrations/chatwoot/client.js'
import {
  findMappedConversation,
  mapPrimaryConversation,
  selectAuthoritativePrimaryConversation,
  shouldPersistConversationMapping,
} from './conversationSelection.js'
import type { ChatContextRepository } from './repository.js'

export type ChatContextReason =
  | 'none'
  | 'chatwoot_not_configured'
  | 'chatwoot_unavailable'
  | 'contact_link_missing'
  | 'conversation_mapping_unavailable'
  | 'conversation_missing'
  | 'primary_conversation_missing'

export type ChatContextResult = 'not_ready' | 'ready' | 'unavailable'

export type ChatContextLinkedContact = {
  id: number
}

export type ChatContextPrimaryConversation = {
  assigneeName: string | null
  id: number
  inboxId: number
  lastActivityAt: number | null
  status: string
}

export type ChatContextSnapshot = {
  linkedContact: ChatContextLinkedContact | null
  primaryConversation: ChatContextPrimaryConversation | null
  reason: ChatContextReason
  result: ChatContextResult
}

type CreateChatContextServiceOptions = {
  chatContextRepository: Pick<
    ChatContextRepository,
    | 'createContactLink'
    | 'findContactLinkByUserId'
    | 'findConversationMappingByUserId'
    | 'findPortalUserById'
    | 'transactionWithConversationBootstrapLock'
    | 'upsertConversationMapping'
  >
  chatwootClient: Pick<
    ChatwootClient,
    | 'createContactInbox'
    | 'createConversation'
    | 'ensurePortalInboxSingleConversationRouting'
    | 'findContactByEmail'
    | 'findContactPortalInboxSourceId'
    | 'listContactConversations'
  >
  now?: () => Date
}

type GetCurrentUserChatContextInput = {
  selectedPrimaryConversationId?: number | null
  userId: number
}

function buildSnapshot({
  linkedContact = null,
  primaryConversation = null,
  reason,
  result,
}: ChatContextSnapshot): ChatContextSnapshot {
  return {
    linkedContact,
    primaryConversation,
    reason,
    result,
  }
}

function isChatwootUnavailableError(error: unknown) {
  return (
    error instanceof ChatwootClientConfigurationError ||
    error instanceof ChatwootClientRequestError
  )
}

function hasValidMappingForLinkedContact(
  mapping: {
    chatwootContactId: number
    chatwootConversationId: number
    chatwootInboxId: number
  } | null,
  linkedContact: ChatContextLinkedContact,
) {
  return Boolean(mapping && mapping.chatwootContactId === linkedContact.id)
}

function createUnavailableSnapshotForChatwootError({
  error,
  linkedContact = null,
}: {
  error: unknown
  linkedContact?: ChatContextLinkedContact | null
}) {
  if (error instanceof ChatwootClientConfigurationError) {
    return buildSnapshot({
      linkedContact,
      primaryConversation: null,
      reason: 'chatwoot_not_configured',
      result: 'unavailable',
    })
  }

  if (isChatwootUnavailableError(error)) {
    return buildSnapshot({
      linkedContact,
      primaryConversation: null,
      reason: 'chatwoot_unavailable',
      result: 'unavailable',
    })
  }

  throw error
}

export function createChatContextService({
  chatContextRepository,
  chatwootClient,
  now = () => new Date(),
}: CreateChatContextServiceOptions) {
  async function resolveLinkedContact(userId: number) {
    const existingLink =
      await chatContextRepository.findContactLinkByUserId(userId)

    if (existingLink) {
      return {
        linkedContact: {
          id: existingLink.chatwootContactId,
        },
        snapshot: null,
      }
    }

    const user = await chatContextRepository.findPortalUserById(userId)

    if (!user) {
      return {
        linkedContact: null,
        snapshot: buildSnapshot({
          linkedContact: null,
          primaryConversation: null,
          reason: 'contact_link_missing',
          result: 'not_ready',
        }),
      }
    }

    let contact: { id: number } | null

    try {
      contact = await chatwootClient.findContactByEmail(user.email)
    } catch (error) {
      if (error instanceof ChatwootClientConfigurationError) {
        return {
          linkedContact: null,
          snapshot: buildSnapshot({
            linkedContact: null,
            primaryConversation: null,
            reason: 'contact_link_missing',
            result: 'not_ready',
          }),
        }
      }

      return {
        linkedContact: null,
        snapshot: createUnavailableSnapshotForChatwootError({
          error,
        }),
      }
    }

    if (!contact) {
      return {
        linkedContact: null,
        snapshot: buildSnapshot({
          linkedContact: null,
          primaryConversation: null,
          reason: 'contact_link_missing',
          result: 'not_ready',
        }),
      }
    }

    const linkedContact = {
      id: contact.id,
    }

    try {
      const persistedLink = await chatContextRepository.createContactLink({
        chatwootContactId: contact.id,
        userId,
      })

      if (!persistedLink || persistedLink.chatwootContactId !== contact.id) {
        return {
          linkedContact: null,
          snapshot: buildSnapshot({
            linkedContact: null,
            primaryConversation: null,
            reason: 'contact_link_missing',
            result: 'not_ready',
          }),
        }
      }
    } catch {
      return {
        linkedContact: null,
        snapshot: buildSnapshot({
          linkedContact: null,
          primaryConversation: null,
          reason: 'conversation_mapping_unavailable',
          result: 'unavailable',
        }),
      }
    }

    return {
      linkedContact,
      snapshot: null,
    }
  }

  async function getCurrentUserChatContext({
    selectedPrimaryConversationId = null,
    userId,
  }: GetCurrentUserChatContextInput): Promise<ChatContextSnapshot> {
    const linkedContactResult = await resolveLinkedContact(userId)

    if (linkedContactResult.snapshot) {
      return linkedContactResult.snapshot
    }

    const linkedContact = linkedContactResult.linkedContact

    let conversations: ChatwootConversation[]

    try {
      conversations = await chatwootClient.listContactConversations(
        linkedContact.id,
      )
    } catch (error) {
      if (error instanceof ChatwootClientConfigurationError) {
        return buildSnapshot({
          linkedContact,
          primaryConversation: null,
          reason: 'chatwoot_not_configured',
          result: 'unavailable',
        })
      }

      if (isChatwootUnavailableError(error)) {
        return buildSnapshot({
          linkedContact,
          primaryConversation: null,
          reason: 'chatwoot_unavailable',
          result: 'unavailable',
        })
      }

      throw error
    }

    if (conversations.length > 1) {
      try {
        await chatwootClient.ensurePortalInboxSingleConversationRouting()
      } catch (error) {
        if (error instanceof ChatwootClientConfigurationError) {
          return buildSnapshot({
            linkedContact,
            primaryConversation: null,
            reason: 'chatwoot_not_configured',
            result: 'unavailable',
          })
        }

        if (isChatwootUnavailableError(error)) {
          return buildSnapshot({
            linkedContact,
            primaryConversation: null,
            reason: 'chatwoot_unavailable',
            result: 'unavailable',
          })
        }

        throw error
      }
    }

    let mapping: {
      chatwootContactId: number
      chatwootConversationId: number
      chatwootInboxId: number
    } | null

    try {
      mapping =
        await chatContextRepository.findConversationMappingByUserId(userId)
    } catch {
      return buildSnapshot({
        linkedContact,
        primaryConversation: null,
        reason: 'conversation_mapping_unavailable',
        result: 'unavailable',
      })
    }

    const primaryConversation =
      findMappedConversation(conversations, mapping, linkedContact) ??
      selectAuthoritativePrimaryConversation(conversations)

    if (!primaryConversation) {
      return buildSnapshot({
        linkedContact,
        primaryConversation: null,
        reason:
          selectedPrimaryConversationId !== null &&
          hasValidMappingForLinkedContact(mapping, linkedContact)
            ? 'primary_conversation_missing'
            : 'conversation_missing',
        result: 'not_ready',
      })
    }

    if (
      selectedPrimaryConversationId !== null &&
      selectedPrimaryConversationId !== primaryConversation.id
    ) {
      return buildSnapshot({
        linkedContact,
        primaryConversation: null,
        reason: 'primary_conversation_missing',
        result: 'not_ready',
      })
    }

    if (
      shouldPersistConversationMapping({
        linkedContact,
        mapping,
        primaryConversation,
      })
    ) {
      try {
        await chatContextRepository.upsertConversationMapping({
          chatwootContactId: linkedContact.id,
          chatwootConversationId: primaryConversation.id,
          chatwootInboxId: primaryConversation.inboxId,
          now: now(),
          userId,
        })
      } catch {
        return buildSnapshot({
          linkedContact,
          primaryConversation: null,
          reason: 'conversation_mapping_unavailable',
          result: 'unavailable',
        })
      }
    }

    return buildSnapshot({
      linkedContact,
      primaryConversation: mapPrimaryConversation(primaryConversation),
      reason: 'none',
      result: 'ready',
    })
  }

  async function persistConversationMapping({
    linkedContact,
    primaryConversation,
    userId,
  }: {
    linkedContact: ChatContextLinkedContact
    primaryConversation: ChatwootConversation
    userId: number
  }) {
    try {
      await chatContextRepository.upsertConversationMapping({
        chatwootContactId: linkedContact.id,
        chatwootConversationId: primaryConversation.id,
        chatwootInboxId: primaryConversation.inboxId,
        now: now(),
        userId,
      })
    } catch {
      return buildSnapshot({
        linkedContact,
        primaryConversation: null,
        reason: 'conversation_mapping_unavailable',
        result: 'unavailable',
      })
    }

    return null
  }

  async function ensurePortalContactInboxSourceId(
    linkedContact: ChatContextLinkedContact,
  ) {
    const currentSourceId = await chatwootClient.findContactPortalInboxSourceId(
      linkedContact.id,
    )

    if (currentSourceId) {
      return currentSourceId
    }

    try {
      const createdContactInbox = await chatwootClient.createContactInbox({
        contactId: linkedContact.id,
        sourceId: `portal-contact:${randomUUID()}`,
      })

      return createdContactInbox.sourceId
    } catch (error) {
      if (error instanceof ChatwootClientRequestError) {
        return chatwootClient.findContactPortalInboxSourceId(linkedContact.id)
      }

      throw error
    }
  }

  async function bootstrapPrimaryConversation({
    linkedContact,
    userId,
  }: {
    linkedContact: ChatContextLinkedContact
    userId: number
  }) {
    let sourceId: string | null

    try {
      sourceId = await ensurePortalContactInboxSourceId(linkedContact)
    } catch (error) {
      return createUnavailableSnapshotForChatwootError({
        error,
        linkedContact,
      })
    }

    if (!sourceId) {
      return buildSnapshot({
        linkedContact,
        primaryConversation: null,
        reason: 'conversation_missing',
        result: 'not_ready',
      })
    }

    let primaryConversation: ChatwootConversation

    try {
      primaryConversation = await chatwootClient.createConversation({
        contactId: linkedContact.id,
        sourceId,
      })
    } catch (error) {
      return createUnavailableSnapshotForChatwootError({
        error,
        linkedContact,
      })
    }

    const mappingErrorSnapshot = await persistConversationMapping({
      linkedContact,
      primaryConversation,
      userId,
    })

    if (mappingErrorSnapshot) {
      return mappingErrorSnapshot
    }

    return buildSnapshot({
      linkedContact,
      primaryConversation: mapPrimaryConversation(primaryConversation),
      reason: 'none',
      result: 'ready',
    })
  }

  async function bootstrapPrimaryConversationWithLock({
    linkedContact,
    userId,
  }: {
    linkedContact: ChatContextLinkedContact
    userId: number
  }) {
    return chatContextRepository.transactionWithConversationBootstrapLock(
      linkedContact.id,
      async () => {
        const lockedContext = await getCurrentUserChatContext({
          selectedPrimaryConversationId: null,
          userId,
        })

        if (lockedContext.result === 'ready') {
          return lockedContext
        }

        if (
          lockedContext.result === 'not_ready' &&
          lockedContext.reason === 'conversation_missing' &&
          lockedContext.linkedContact
        ) {
          return bootstrapPrimaryConversation({
            linkedContact: lockedContext.linkedContact,
            userId,
          })
        }

        return lockedContext
      },
    )
  }

  return {
    getCurrentUserChatContext,

    async ensureCurrentUserWritableChatContext({
      selectedPrimaryConversationId = null,
      userId,
    }: GetCurrentUserChatContextInput): Promise<ChatContextSnapshot> {
      const currentContext = await getCurrentUserChatContext({
        selectedPrimaryConversationId,
        userId,
      })

      if (currentContext.result === 'ready') {
        return currentContext
      }

      if (
        currentContext.result === 'not_ready' &&
        currentContext.reason === 'conversation_missing' &&
        currentContext.linkedContact
      ) {
        return bootstrapPrimaryConversationWithLock({
          linkedContact: currentContext.linkedContact,
          userId,
        })
      }

      if (
        currentContext.result === 'not_ready' &&
        currentContext.reason === 'primary_conversation_missing' &&
        selectedPrimaryConversationId !== null
      ) {
        const fallbackContext = await getCurrentUserChatContext({
          selectedPrimaryConversationId: null,
          userId,
        })

        if (
          fallbackContext.result === 'not_ready' &&
          fallbackContext.reason === 'conversation_missing' &&
          fallbackContext.linkedContact
        ) {
          return bootstrapPrimaryConversationWithLock({
            linkedContact: fallbackContext.linkedContact,
            userId,
          })
        }
      }

      return currentContext
    },
  }
}

export type ChatContextService = ReturnType<typeof createChatContextService>
