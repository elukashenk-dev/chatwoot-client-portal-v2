import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { loadEnv } from '../config/env.js'
import { createChatwootClient } from '../integrations/chatwoot/client.js'

const DEFAULT_WEBHOOK_PATH = '/api/integrations/chatwoot/webhooks/account'
const DEFAULT_WEBHOOK_SUBSCRIPTIONS = ['message_created', 'message_updated']

function readArgument(flag: string) {
  const prefix = `${flag}=`
  const argument = process.argv.find((value) => value.startsWith(prefix))

  return argument ? argument.slice(prefix.length).trim() : ''
}

function hasFlag(flag: string) {
  return process.argv.includes(flag)
}

function normalizeSubscriptions(rawValue: string) {
  if (!rawValue.trim()) {
    return DEFAULT_WEBHOOK_SUBSCRIPTIONS
  }

  const subscriptions = [
    ...new Set(
      rawValue
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ]

  return subscriptions.length > 0
    ? subscriptions
    : DEFAULT_WEBHOOK_SUBSCRIPTIONS
}

function safePathname(value: string) {
  try {
    return new URL(value).pathname
  } catch {
    return null
  }
}

function defaultCallbackUrl({
  callbackUrl,
  configuredCallbackUrl,
  port,
}: {
  callbackUrl: string
  configuredCallbackUrl?: string | undefined
  port: number
}) {
  if (callbackUrl) {
    return callbackUrl
  }

  if (configuredCallbackUrl) {
    return configuredCallbackUrl
  }

  return `http://127.0.0.1:${port}${DEFAULT_WEBHOOK_PATH}`
}

function upsertDotEnvValue({
  envPath,
  key,
  value,
}: {
  envPath: string
  key: string
  value: string
}) {
  const currentContent = existsSync(envPath)
    ? readFileSync(envPath, 'utf8')
    : ''
  const nextLine = `${key}=${value}`
  const linePattern = new RegExp(`^${key}=.*$`, 'm')
  const nextContent = linePattern.test(currentContent)
    ? currentContent.replace(linePattern, nextLine)
    : `${currentContent}${currentContent.endsWith('\n') || !currentContent ? '' : '\n'}${nextLine}\n`

  writeFileSync(envPath, nextContent)
}

const env = loadEnv()
const callbackUrl = defaultCallbackUrl({
  callbackUrl: readArgument('--callback-url'),
  configuredCallbackUrl: env.CHATWOOT_WEBHOOK_CALLBACK_URL,
  port: env.PORT,
})
const callbackPathname = safePathname(callbackUrl)
const explicitWebhookId = Number(readArgument('--webhook-id'))
const subscriptions = normalizeSubscriptions(readArgument('--subscriptions'))
const shouldWriteEnv = hasFlag('--write-env')
const chatwootClient = createChatwootClient({ env })

const existingWebhooks = await chatwootClient.listAccountWebhooks()
const matchedWebhook =
  Number.isInteger(explicitWebhookId) && explicitWebhookId > 0
    ? (existingWebhooks.find((webhook) => webhook.id === explicitWebhookId) ??
      null)
    : (existingWebhooks.find(
        (webhook) =>
          webhook.url === callbackUrl ||
          (callbackPathname !== null &&
            safePathname(webhook.url) === callbackPathname),
      ) ?? null)

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

let envUpdated = false

if (shouldWriteEnv) {
  if (!savedWebhook.secret) {
    throw new Error(
      'Chatwoot did not return a webhook secret to write to .env.',
    )
  }

  upsertDotEnvValue({
    envPath: resolve(process.cwd(), '..', '.env'),
    key: 'CHATWOOT_WEBHOOK_SECRET',
    value: savedWebhook.secret,
  })
  envUpdated = true
}

console.log(
  JSON.stringify(
    {
      action: matchedWebhook ? 'updated' : 'created',
      callbackUrl,
      envUpdated,
      subscriptions: savedWebhook.subscriptions,
      webhook: {
        hasSecret: Boolean(savedWebhook.secret),
        id: savedWebhook.id,
        url: savedWebhook.url,
      },
    },
    null,
    2,
  ),
)
