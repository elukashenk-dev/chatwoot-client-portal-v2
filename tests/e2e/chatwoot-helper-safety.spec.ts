import { createServer, type RequestListener, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { expect, test } from '@playwright/test'

import { createChatwootContactForE2e } from './support/chatwoot.ts'

async function startLoopbackServer(listener: RequestListener) {
  const server = createServer(listener)

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })

  const address = server.address() as AddressInfo

  return {
    origin: `http://127.0.0.1:${address.port}`,
    server,
  }
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

test('local Chatwoot contact helper refuses redirects for mutating requests', async () => {
  let redirectorRequestCount = 0
  let redirectedRequestCount = 0
  const sink = await startLoopbackServer((_request, response) => {
    redirectedRequestCount += 1
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ id: 999 }))
  })
  const redirector = await startLoopbackServer((_request, response) => {
    redirectorRequestCount += 1
    response.writeHead(307, {
      Location: `${sink.origin}/redirected-contact`,
    })
    response.end()
  })
  const environmentKeys = [
    'E2E_CHATWOOT_ACCOUNT_ID',
    'E2E_CHATWOOT_API_ACCESS_TOKEN',
    'E2E_CHATWOOT_BASE_URL',
    'E2E_CHATWOOT_PORTAL_INBOX_ID',
    'NODE_USE_ENV_PROXY',
  ] as const
  const previousEnvironment = new Map(
    environmentKeys.map((key) => [key, process.env[key]]),
  )

  process.env.E2E_CHATWOOT_ACCOUNT_ID = '3'
  process.env.E2E_CHATWOOT_API_ACCESS_TOKEN = 'test-token'
  process.env.E2E_CHATWOOT_BASE_URL = redirector.origin
  process.env.E2E_CHATWOOT_PORTAL_INBOX_ID = '9'
  process.env.NODE_USE_ENV_PROXY = '0'

  try {
    await expect(
      createChatwootContactForE2e({
        email: 'redirect-guard@example.test',
        name: 'Redirect Guard',
      }),
    ).rejects.toThrow()
    expect(redirectorRequestCount).toBe(1)
    expect(redirectedRequestCount).toBe(0)
  } finally {
    for (const key of environmentKeys) {
      const previousValue = previousEnvironment.get(key)

      if (previousValue === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = previousValue
      }
    }

    await Promise.all([
      closeServer(redirector.server),
      closeServer(sink.server),
    ])
  }
})

test('local Chatwoot contact helper refuses Node environment proxy mode', async () => {
  const environmentKeys = [
    'E2E_CHATWOOT_ACCOUNT_ID',
    'E2E_CHATWOOT_API_ACCESS_TOKEN',
    'E2E_CHATWOOT_BASE_URL',
    'E2E_CHATWOOT_PORTAL_INBOX_ID',
    'NODE_USE_ENV_PROXY',
  ] as const
  const previousEnvironment = new Map(
    environmentKeys.map((key) => [key, process.env[key]]),
  )

  process.env.E2E_CHATWOOT_ACCOUNT_ID = '3'
  process.env.E2E_CHATWOOT_API_ACCESS_TOKEN = 'test-token'
  process.env.E2E_CHATWOOT_BASE_URL = 'http://127.0.0.1:9'
  process.env.E2E_CHATWOOT_PORTAL_INBOX_ID = '9'
  process.env.NODE_USE_ENV_PROXY = '1'

  try {
    await expect(
      createChatwootContactForE2e({
        email: 'proxy-guard@example.test',
        name: 'Proxy Guard',
      }),
    ).rejects.toThrow(
      'Node environment proxy mode must be disabled for loopback Chatwoot E2E mutations.',
    )
  } finally {
    for (const key of environmentKeys) {
      const previousValue = previousEnvironment.get(key)

      if (previousValue === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = previousValue
      }
    }
  }
})
