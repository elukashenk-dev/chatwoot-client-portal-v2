import type { ChatThreadsService } from '../chat-threads/service.js'
import type { CurrentUserChatThreadContext } from '../chat-threads/types.js'

type RecoverableChatThreadsService = Pick<
  ChatThreadsService,
  'recoverCurrentUserWritableThreadContext'
>

type SendWithDeletedConversationRecoveryInput<TMessage> = {
  chatThreadsService: RecoverableChatThreadsService
  context: CurrentUserChatThreadContext
  replyToMessageId: number | null
  send: (
    context: CurrentUserChatThreadContext,
    conversationId: number,
  ) => Promise<TMessage | null>
  threadId: string
  userId: number
}

function withMissingConversation(
  context: CurrentUserChatThreadContext,
): CurrentUserChatThreadContext {
  return {
    ...context,
    chatwootConversation: null,
    reason: 'conversation_missing',
    result: 'not_ready',
  }
}

async function recoverWritableContextAfterMissingConversation({
  chatThreadsService,
  staleConversationId,
  threadId,
  userId,
}: {
  chatThreadsService: RecoverableChatThreadsService
  staleConversationId: number
  threadId: string
  userId: number
}) {
  const recoveredContext =
    await chatThreadsService.recoverCurrentUserWritableThreadContext({
      staleConversationId,
      threadId,
      userId,
    })

  if (
    recoveredContext.result === 'ready' &&
    recoveredContext.chatwootConversation?.id === staleConversationId
  ) {
    return withMissingConversation(recoveredContext)
  }

  return recoveredContext
}

export async function sendWithDeletedConversationRecovery<TMessage>({
  chatThreadsService,
  context,
  replyToMessageId,
  send,
  threadId,
  userId,
}: SendWithDeletedConversationRecoveryInput<TMessage>) {
  const conversationId = context.chatwootConversation?.id

  if (!conversationId) {
    return {
      context: withMissingConversation(context),
      message: null,
    }
  }

  const message = await send(context, conversationId)

  if (message !== null) {
    return {
      context,
      message,
    }
  }

  if (replyToMessageId !== null) {
    return {
      context: withMissingConversation(context),
      message: null,
    }
  }

  const recoveredContext = await recoverWritableContextAfterMissingConversation(
    {
      chatThreadsService,
      staleConversationId: conversationId,
      threadId,
      userId,
    },
  )

  if (
    recoveredContext.result !== 'ready' ||
    !recoveredContext.chatwootConversation
  ) {
    return {
      context: recoveredContext,
      message: null,
    }
  }

  const recoveredMessage = await send(
    recoveredContext,
    recoveredContext.chatwootConversation.id,
  )

  return {
    context:
      recoveredMessage === null
        ? withMissingConversation(recoveredContext)
        : recoveredContext,
    message: recoveredMessage,
  }
}
