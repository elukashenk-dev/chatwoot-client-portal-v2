import { afterEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { buildApp } from './app.js'
import { portalChatThreads, portalWebhookWork } from './db/schema.js'
import type { DatabaseClient } from './db/client.js'
import { seedDefaultTenant, testEnv } from './test/appTestHelpers.js'
import { createTestDatabase } from './test/testDatabase.js'
import { createChatwootWebhookRepository } from './modules/chatwoot-webhooks/repository.js'
import { createSignatureDigest } from './modules/chatwoot-webhooks/signature.js'

function signedPayload(event: string, key: string) {
  const payload = JSON.stringify({
    event,
    id: 7632,
    account: { id: 1 },
    inbox: { id: 1 },
    conversation: { id: 174, account_id: 1, inbox_id: 1 },
    private: false,
  })
  const timestamp = String(Math.floor(Date.now() / 1000))
  return {
    method: 'POST' as const,
    url: '/api/chatwoot/webhooks',
    payload,
    headers: {
      host: 'localhost',
      'content-type': 'application/json',
      'x-chatwoot-timestamp': timestamp,
      'x-chatwoot-delivery': key,
      'x-chatwoot-signature': createSignatureDigest({
        rawBody: Buffer.from(payload),
        secret: 'test-webhook-secret',
        timestamp,
      }),
    },
  }
}

describe('webhook ACK and worker app wiring', () => {
  let database: DatabaseClient | undefined
  let app: ReturnType<typeof buildApp> | undefined
  afterEach(async () => {
    await app?.close()
    await database?.close()
  })
  async function setup() {
    database = await createTestDatabase()
    const tenantId = await seedDefaultTenant(database)
    await database.db.insert(portalChatThreads).values({
      tenantId,
      portalUserId: null,
      chatwootContactId: 42,
      chatwootConversationId: 174,
      chatwootInboxId: 1,
      threadType: 'group',
    })
    return tenantId
  }
  it('returns HTTP 200 while Chatwoot processing is blocked, and persists retry before closing the database', async () => {
    await setup()
    let started!: () => void
    const entered = new Promise<void>((resolve) => {
      started = resolve
    })
    const slowFetch = vi.fn<typeof fetch>(async (_url, init) => {
      started()
      return new Promise<Response>((_resolve, reject) => {
        init!.signal!.addEventListener(
          'abort',
          () => reject(new Error('worker stopped')),
          { once: true },
        )
      })
    })
    const close = vi.fn(async () => {
      const rows = await database!.db.select().from(portalWebhookWork)
      expect(rows[0]!.leaseToken).toBeNull()
      expect(rows[0]!.status).toBe('pending')
    })
    app = buildApp({
      database: { db: database!.db, close },
      env: testEnv,
      chatwootFetchFn: slowFetch,
    })
    await app.listen({ host: '127.0.0.1', port: 0 })
    const before = performance.now()
    const response = await app.inject(
      signedPayload('message_created', 'created'),
    )
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ result: 'accepted' })
    expect(performance.now() - before).toBeLessThan(4_000)
    await vi.waitFor(() => expect(slowFetch).toHaveBeenCalledOnce(), {
      timeout: 3000,
      interval: 20,
    })
    await entered
    const duplicate = await app.inject(
      signedPayload('message_created', 'created'),
    )
    expect(duplicate.json()).toEqual({ result: 'duplicate' })
    const updated = await app.inject(
      signedPayload('message_updated', 'read-status'),
    )
    expect(updated.json()).toEqual({ result: 'accepted' })
    expect(slowFetch).toHaveBeenCalledOnce()
    for (const [, init] of slowFetch.mock.calls)
      expect(init?.method ?? 'GET').toBe('GET')
    await app.close()
    expect(close).toHaveBeenCalledOnce()
    app = undefined
  }, 15_000)
  it('recovers accepted work on startup without needing another webhook', async () => {
    const tenantId = await setup()
    await createChatwootWebhookRepository(database!.db, {
      tenantId,
    }).recordDelivery({
      chatwootConversationId: 174,
      chatwootMessageId: 7632,
      deliveryKey: 'before-restart',
      eventName: 'message_updated',
      now: new Date(),
      payloadSha256: 'hash',
      status: 'accepted',
      source: {
        accountId: 1,
        inboxId: 1,
        baseUrl: 'https://chatwoot.example.test',
      },
    })
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('No network expected'))
    app = buildApp({
      database: { db: database!.db, close: async () => {} },
      env: testEnv,
      chatwootFetchFn: fetchFn,
    })
    await app.listen({ host: '127.0.0.1', port: 0 })
    await vi.waitFor(
      async () => {
        const [row] = await database!.db
          .select()
          .from(portalWebhookWork)
          .where(eq(portalWebhookWork.tenantId, tenantId))
        expect(row?.status).toBe('done')
      },
      { interval: 20, timeout: 4_000 },
    )
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
