import { describe, expect, it, vi } from 'vitest'

import {
  createChatwootBridgeClient,
  maskChatwootTelegramWebhookUrl,
} from './chatwootBridgeClient.js'
import type { TelegramUpdate } from './types.js'
import { createChatwootFetch } from '../integrations/chatwoot/request.js'

const testBridgeConfig = {
  accountId: 3,
  apiAccessToken: 'account-token',
  baseUrl: 'https://chatwoot.example.test',
  botToken: '1234567890:AAExampleTelegramBotTokenSecretValue',
  telegramInboxId: 17,
}

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  })
}

function createClient(
  fetchFn: typeof fetch,
  findContactsByPhone = vi.fn(),
) {
  return createChatwootBridgeClient({
    config: testBridgeConfig,
    fetchChatwoot: createChatwootFetch({
      fetchFn,
      requestTimeoutMs: 15_000,
    }),
    findContactsByPhone,
  })
}

describe('createChatwootBridgeClient', () => {
  it('treats contact_inboxes/filter 404 as a missing link', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse(
        {
          error: 'Not found',
        },
        404,
      ),
    )

    await expect(
      createClient(fetchFn).findContactInboxBySourceId('77'),
    ).resolves.toBeNull()

    expect(fetchFn).toHaveBeenCalledWith(
      new URL(
        'https://chatwoot.example.test/api/v1/accounts/3/contact_inboxes/filter',
      ),
      expect.objectContaining({
        body: JSON.stringify({
          inbox_id: 17,
          source_id: '77',
        }),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          api_access_token: 'account-token',
        }),
        method: 'POST',
      }),
    )
  })

  it('returns an existing contact inbox link from contact_inboxes/filter', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        contact_inboxes: [
          {
            inbox: {
              id: 17,
            },
            source_id: '77',
          },
        ],
        id: 44,
      }),
    )

    await expect(
      createClient(fetchFn).findContactInboxBySourceId('77'),
    ).resolves.toEqual({
      contactId: 44,
      inboxId: 17,
      sourceId: '77',
    })
  })

  it('does not accept stale contact inbox links with mismatched inbox or source id', async () => {
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        createJsonResponse({
          contact_inboxes: [
            {
              inbox: {
                id: 18,
              },
              source_id: '77',
            },
          ],
          id: 44,
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          contact_inboxes: [
            {
              inbox: {
                id: 17,
              },
              source_id: '88',
            },
          ],
          id: 44,
        }),
      )

    await expect(
      createClient(fetchFn).findContactInboxBySourceId('77'),
    ).resolves.toBeNull()
    await expect(
      createClient(fetchFn).findContactInboxBySourceId('77'),
    ).resolves.toBeNull()
  })

  it('delegates phone lookup and accepts exactly one matching contact', async () => {
    const findContactsByPhone = vi.fn().mockResolvedValue([
      {
        email: null,
        id: 44,
        name: 'Иван Петров',
        phoneNumber: '+79161234567',
      },
    ])

    await expect(
      createClient(vi.fn<typeof fetch>(), findContactsByPhone)
        .findSingleContactByPhone('89161234567'),
    ).resolves.toEqual({
      contact: {
        email: null,
        id: 44,
        name: 'Иван Петров',
        phoneNumber: '+79161234567',
      },
      outcome: 'found',
    })

    expect(findContactsByPhone).toHaveBeenCalledWith(
      expect.objectContaining({
        config: {
          accountId: 3,
          apiAccessToken: 'account-token',
          baseUrl: 'https://chatwoot.example.test',
        },
        phone: '89161234567',
      }),
    )
  })

  it('rejects zero or multiple phone matches without creating links', async () => {
    await expect(
      createClient(
        vi.fn<typeof fetch>(),
        vi.fn().mockResolvedValue([]),
      ).findSingleContactByPhone('89161234567'),
    ).resolves.toEqual({
      outcome: 'not_found',
    })

    await expect(
      createClient(
        vi.fn<typeof fetch>(),
        vi.fn().mockResolvedValue([
          {
            id: 44,
            phoneNumber: '+79161234567',
          },
          {
            id: 45,
            phoneNumber: '+79161234567',
          },
        ]),
      ).findSingleContactByPhone('89161234567'),
    ).resolves.toEqual({
      outcome: 'ambiguous',
    })
  })

  it('creates a contact inbox link for an existing Chatwoot contact', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        inbox: {
          id: 17,
        },
        source_id: '77',
      }),
    )

    await expect(
      createClient(fetchFn).createContactInbox(44, '77'),
    ).resolves.toEqual({
      contactId: 44,
      inboxId: 17,
      sourceId: '77',
    })

    expect(fetchFn).toHaveBeenCalledWith(
      new URL(
        'https://chatwoot.example.test/api/v1/accounts/3/contacts/44/contact_inboxes',
      ),
      expect.objectContaining({
        body: JSON.stringify({
          inbox_id: 17,
          source_id: '77',
        }),
        method: 'POST',
      }),
    )
  })

  it('forwards the exact Telegram payload to Chatwoot webhook without Account API auth', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        ok: true,
      }),
    )
    const payload = {
      message: {
        chat: {
          id: -100,
          type: 'private',
        },
        message_id: 1,
        text: 'hello',
      },
      update_id: 55,
    } satisfies TelegramUpdate

    await expect(
      createClient(fetchFn).forwardTelegramUpdateToChatwoot(payload),
    ).resolves.toBeUndefined()

    expect(fetchFn).toHaveBeenCalledWith(
      new URL(
        `https://chatwoot.example.test/webhooks/telegram/${testBridgeConfig.botToken}`,
      ),
      expect.objectContaining({
        body: JSON.stringify(payload),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    )
  })

  it('masks token-bearing Chatwoot webhook URLs in errors', async () => {
    const rawUrl = `https://chatwoot.example.test/webhooks/telegram/${testBridgeConfig.botToken}`

    expect(maskChatwootTelegramWebhookUrl(rawUrl)).toBe(
      'https://chatwoot.example.test/webhooks/telegram/[redacted]',
    )

    await expect(
      createClient(
        vi.fn<typeof fetch>().mockResolvedValue(createJsonResponse({}, 500)),
      ).forwardTelegramUpdateToChatwoot({
        update_id: 55,
      }),
    ).rejects.toThrow('/webhooks/telegram/[redacted]')

    await expect(
      createClient(
        vi.fn<typeof fetch>().mockResolvedValue(createJsonResponse({}, 500)),
      ).forwardTelegramUpdateToChatwoot({
        update_id: 55,
      }),
    ).rejects.not.toThrow(testBridgeConfig.botToken)
  })
})
