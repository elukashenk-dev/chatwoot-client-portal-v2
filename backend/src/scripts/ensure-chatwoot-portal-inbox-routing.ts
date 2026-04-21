import { existsSync, readFileSync } from 'node:fs'

import { createChatwootClient } from '../integrations/chatwoot/client.js'

function parseDotEnv() {
  const envPath = new URL('../../../.env', import.meta.url)

  if (!existsSync(envPath)) {
    return {}
  }

  return Object.fromEntries(
    readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separatorIndex = line.indexOf('=')

        if (separatorIndex === -1) {
          return null
        }

        const key = line.slice(0, separatorIndex)
        const value = line.slice(separatorIndex + 1).replace(/^['"]|['"]$/g, '')

        return [key, value] as const
      })
      .filter((entry): entry is readonly [string, string] => entry !== null),
  )
}

function readPositiveInteger(value: string | undefined) {
  if (!value) {
    return undefined
  }

  const parsedValue = Number(value)

  return Number.isInteger(parsedValue) && parsedValue > 0
    ? parsedValue
    : undefined
}

const rawEnv = {
  ...parseDotEnv(),
  ...process.env,
}
const env = {
  CHATWOOT_ACCOUNT_ID: readPositiveInteger(rawEnv.CHATWOOT_ACCOUNT_ID),
  CHATWOOT_API_ACCESS_TOKEN: rawEnv.CHATWOOT_API_ACCESS_TOKEN,
  CHATWOOT_BASE_URL: rawEnv.CHATWOOT_BASE_URL,
  CHATWOOT_PORTAL_INBOX_ID: readPositiveInteger(
    rawEnv.CHATWOOT_PORTAL_INBOX_ID,
  ),
}
const chatwootClient = createChatwootClient({ env })

try {
  const result =
    await chatwootClient.ensurePortalInboxSingleConversationRouting()

  console.log(
    JSON.stringify(
      {
        channelType: result.channelType,
        id: result.id,
        lockToSingleConversation: result.lockToSingleConversation,
        ok: true,
        updated: result.updated,
      },
      null,
      2,
    ),
  )
} catch (error) {
  console.error(error)
  process.exit(1)
}
