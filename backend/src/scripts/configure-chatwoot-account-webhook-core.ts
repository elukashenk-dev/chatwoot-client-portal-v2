import type { ChatwootAccountWebhook } from '../integrations/chatwoot/client.js'

export const DEFAULT_WEBHOOK_PATH =
  '/api/integrations/chatwoot/webhooks/account'
export const DEFAULT_WEBHOOK_SUBSCRIPTIONS = [
  'message_created',
  'message_updated',
]

type ChatwootAccountWebhookClient = {
  createAccountWebhook(options: {
    name?: string | null
    subscriptions: string[]
    url: string
  }): Promise<ChatwootAccountWebhook>
  listAccountWebhooks(): Promise<ChatwootAccountWebhook[]>
  updateAccountWebhook(options: {
    name?: string | null
    subscriptions: string[]
    url: string
    webhookId: number
  }): Promise<ChatwootAccountWebhook>
}

type ConfigureAccountWebhookOptions = {
  callbackUrl: string
  chatwootClient: ChatwootAccountWebhookClient
  explicitWebhookId: number | null
  subscriptions: string[]
}

export type ConfigureAccountWebhookResult = {
  action: 'created' | 'updated'
  callbackUrl: string
  secret: string | null
  secretSource:
    | 'save-response'
    | 'matched-webhook'
    | 'refreshed-list'
    | 'missing'
  subscriptions: string[]
  webhook: {
    hasSecret: boolean
    id: number
    url: string
  }
}

function safePathname(value: string) {
  try {
    return new URL(value).pathname
  } catch {
    return null
  }
}

function singleLine(value: string | number | boolean | null) {
  return String(value ?? '').replace(/[\r\n]/g, '')
}

function findMatchingWebhook({
  callbackPathname,
  callbackUrl,
  explicitWebhookId,
  webhooks,
}: {
  callbackPathname: string | null
  callbackUrl: string
  explicitWebhookId: number | null
  webhooks: ChatwootAccountWebhook[]
}) {
  if (explicitWebhookId !== null) {
    return webhooks.find((webhook) => webhook.id === explicitWebhookId) ?? null
  }

  return (
    webhooks.find(
      (webhook) =>
        webhook.url === callbackUrl ||
        (callbackPathname !== null &&
          safePathname(webhook.url) === callbackPathname),
    ) ?? null
  )
}

async function resolveSavedWebhookSecret({
  callbackPathname,
  callbackUrl,
  chatwootClient,
  matchedWebhook,
  savedWebhook,
}: {
  callbackPathname: string | null
  callbackUrl: string
  chatwootClient: ChatwootAccountWebhookClient
  matchedWebhook: ChatwootAccountWebhook | null
  savedWebhook: ChatwootAccountWebhook
}) {
  if (savedWebhook.secret) {
    return {
      secret: savedWebhook.secret,
      source: 'save-response' as const,
    }
  }

  if (matchedWebhook?.secret) {
    return {
      secret: matchedWebhook.secret,
      source: 'matched-webhook' as const,
    }
  }

  const refreshedWebhooks = await chatwootClient.listAccountWebhooks()
  const refreshedWebhook =
    refreshedWebhooks.find((webhook) => webhook.id === savedWebhook.id) ??
    findMatchingWebhook({
      callbackPathname,
      callbackUrl,
      explicitWebhookId: null,
      webhooks: refreshedWebhooks,
    })

  return {
    secret: refreshedWebhook?.secret ?? null,
    source: refreshedWebhook?.secret ? 'refreshed-list' : 'missing',
  } as const
}

export async function configureAccountWebhook({
  callbackUrl,
  chatwootClient,
  explicitWebhookId,
  subscriptions,
}: ConfigureAccountWebhookOptions): Promise<ConfigureAccountWebhookResult> {
  const callbackPathname = safePathname(callbackUrl)
  const existingWebhooks = await chatwootClient.listAccountWebhooks()
  const matchedWebhook = findMatchingWebhook({
    callbackPathname,
    callbackUrl,
    explicitWebhookId,
    webhooks: existingWebhooks,
  })
  const savedWebhook = matchedWebhook
    ? await chatwootClient.updateAccountWebhook({
        name: 'Portal realtime',
        subscriptions,
        url: callbackUrl,
        webhookId: matchedWebhook.id,
      })
    : await chatwootClient.createAccountWebhook({
        name: 'Portal realtime',
        subscriptions,
        url: callbackUrl,
      })
  const resolvedSecret = await resolveSavedWebhookSecret({
    callbackPathname,
    callbackUrl,
    chatwootClient,
    matchedWebhook,
    savedWebhook,
  })

  return {
    action: matchedWebhook ? 'updated' : 'created',
    callbackUrl,
    secret: resolvedSecret.secret,
    secretSource: resolvedSecret.source,
    subscriptions: savedWebhook.subscriptions,
    webhook: {
      hasSecret: Boolean(resolvedSecret.secret),
      id: savedWebhook.id,
      url: savedWebhook.url,
    },
  }
}

export function createSafeWebhookReport({
  envUpdated,
  result,
}: {
  envUpdated: boolean
  result: ConfigureAccountWebhookResult
}) {
  return {
    action: result.action,
    callbackUrl: result.callbackUrl,
    envUpdated,
    secretSource: result.secretSource,
    subscriptions: result.subscriptions,
    webhook: result.webhook,
  }
}

export function formatInstallerWebhookOutput(
  result: ConfigureAccountWebhookResult,
) {
  return [
    `ACTION=${singleLine(result.action)}`,
    `CALLBACK_URL=${singleLine(result.callbackUrl)}`,
    `SECRET_SOURCE=${singleLine(result.secretSource)}`,
    `SUBSCRIPTIONS=${singleLine(result.subscriptions.join(','))}`,
    `WEBHOOK_HAS_SECRET=${singleLine(result.webhook.hasSecret)}`,
    `WEBHOOK_ID=${singleLine(result.webhook.id)}`,
    `WEBHOOK_URL=${singleLine(result.webhook.url)}`,
    `WEBHOOK_SECRET=${singleLine(result.secret)}`,
  ].join('\n')
}
