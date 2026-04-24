import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { loadEnv } from '../config/env.js'
import { createChatwootClient } from '../integrations/chatwoot/client.js'
import {
  DEFAULT_WEBHOOK_PATH,
  DEFAULT_WEBHOOK_SUBSCRIPTIONS,
  configureAccountWebhook,
  createSafeWebhookReport,
  formatInstallerWebhookOutput,
} from './configure-chatwoot-account-webhook-core.js'

function readArgument(flag: string) {
  const prefix = `${flag}=`
  const argument = process.argv.find((value) => value.startsWith(prefix))

  return argument ? argument.slice(prefix.length).trim() : ''
}

function hasFlag(flag: string) {
  return process.argv.includes(flag)
}

function readOutputMode() {
  const output = readArgument('--output')

  if (output) {
    return output
  }

  return hasFlag('--installer-output') ? 'installer' : 'safe-json'
}

function readPositiveIntegerArgument(flag: string) {
  const value = Number(readArgument(flag))

  return Number.isInteger(value) && value > 0 ? value : null
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
const explicitWebhookId = readPositiveIntegerArgument('--webhook-id')
const subscriptions = normalizeSubscriptions(readArgument('--subscriptions'))
const shouldWriteEnv = hasFlag('--write-env')
const outputMode = readOutputMode()
const chatwootClient = createChatwootClient({ env })
const result = await configureAccountWebhook({
  callbackUrl,
  chatwootClient,
  explicitWebhookId,
  subscriptions,
})

let envUpdated = false

if (shouldWriteEnv) {
  if (!result.secret) {
    throw new Error(
      'Chatwoot did not return a webhook secret to write to .env.',
    )
  }

  upsertDotEnvValue({
    envPath: resolve(process.cwd(), '..', '.env'),
    key: 'CHATWOOT_WEBHOOK_SECRET',
    value: result.secret,
  })
  envUpdated = true
}

const safeReport = createSafeWebhookReport({ envUpdated, result })

if (outputMode === 'installer') {
  console.log(formatInstallerWebhookOutput(result))
} else {
  console.log(JSON.stringify(safeReport, null, 2))
}
