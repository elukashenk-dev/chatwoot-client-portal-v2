import { ApiError } from '../../lib/errors.js'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readInteger(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number(value)
  }

  return null
}

function readObject(value: unknown) {
  return isPlainObject(value) ? value : null
}

function collectUniqueIntegers(values: unknown[]) {
  return [
    ...new Set(
      values
        .map((value) => readInteger(value))
        .filter((value): value is number => value !== null),
    ),
  ]
}

function readPayloadAccountIds(payload: Record<string, unknown>) {
  const account = readObject(payload.account)
  const conversation = readObject(payload.conversation)
  const conversationAccount = readObject(conversation?.account)

  return collectUniqueIntegers([
    payload.account_id,
    account?.id,
    conversation?.account_id,
    conversationAccount?.id,
  ])
}

function readPayloadInboxIds(payload: Record<string, unknown>) {
  const inbox = readObject(payload.inbox)
  const conversation = readObject(payload.conversation)
  const conversationInbox = readObject(conversation?.inbox)
  const contactInbox = readObject(conversation?.contact_inbox)

  return collectUniqueIntegers([
    payload.inbox_id,
    inbox?.id,
    conversation?.inbox_id,
    conversationInbox?.id,
    contactInbox?.inbox_id,
  ])
}

export function assertChatwootWebhookPayloadTenantInvariants({
  chatwootAccountId,
  chatwootPortalInboxId,
  payload,
}: {
  chatwootAccountId: number
  chatwootPortalInboxId: number
  payload: Record<string, unknown>
}) {
  const hasAccountMismatch = readPayloadAccountIds(payload).some(
    (accountId) => accountId !== chatwootAccountId,
  )
  const hasInboxMismatch = readPayloadInboxIds(payload).some(
    (inboxId) => inboxId !== chatwootPortalInboxId,
  )

  if (hasAccountMismatch || hasInboxMismatch) {
    throw new ApiError(
      403,
      'chatwoot_webhook_tenant_mismatch',
      'Webhook системы поддержки не соответствует конфигурации портала.',
    )
  }
}
