import { describe, expect, it, vi } from 'vitest'

import {
  createChatwootAdminAgentsClient,
  parseChatwootAdminAgentsResponse,
} from './adminAgents.js'
import { ChatwootClientRequestError } from './errors.js'

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
    },
    status,
  })
}

describe('parseChatwootAdminAgentsResponse', () => {
  it('parses required admin verification fields and ignores availability drift and extra fields', () => {
    expect(
      parseChatwootAdminAgentsResponse(
        [
          {
            account_id: 3,
            auto_offline: true,
            availability_status: 'available',
            confirmed: true,
            custom_attributes: { ignored: true },
            email: ' Admin@Example.test ',
            id: 11,
            provider: 'email',
            role: 'administrator',
          },
          {
            account_id: 3,
            availability_status: 'online',
            confirmed: true,
            email: 'agent@example.test',
            id: 12,
            role: 'agent',
          },
        ],
        3,
      ),
    ).toEqual([
      {
        accountId: 3,
        confirmed: true,
        email: 'admin@example.test',
        id: 11,
        role: 'administrator',
      },
      {
        accountId: 3,
        confirmed: true,
        email: 'agent@example.test',
        id: 12,
        role: 'agent',
      },
    ])
  })

  it('drops unsafe agent rows instead of authenticating from partial data', () => {
    expect(
      parseChatwootAdminAgentsResponse(
        [
          {
            account_id: 3,
            confirmed: true,
            email: 'admin@example.test',
            id: 11,
          },
          {
            account_id: 3,
            confirmed: 'true',
            email: 'other@example.test',
            id: 12,
            role: 'administrator',
          },
        ],
        3,
      ),
    ).toEqual([])
  })

  it('rejects non-array Chatwoot agents responses fail-closed', () => {
    expect(() => parseChatwootAdminAgentsResponse({ payload: [] }, 3)).toThrow(
      ChatwootClientRequestError,
    )
  })
})

describe('createChatwootAdminAgentsClient', () => {
  it('lists account agents with the supplied admin verification token', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse([
        {
          account_id: 3,
          confirmed: true,
          email: 'admin@example.test',
          id: 11,
          role: 'administrator',
        },
      ]),
    )
    const client = createChatwootAdminAgentsClient({
      config: {
        accountId: 3,
        apiAccessToken: 'admin-verification-token',
        baseUrl: 'https://chatwoot.example.test/',
      },
      fetchFn,
    })

    await expect(client.listAccountAgents()).resolves.toEqual([
      {
        accountId: 3,
        confirmed: true,
        email: 'admin@example.test',
        id: 11,
        role: 'administrator',
      },
    ])
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      'https://chatwoot.example.test/api/v1/accounts/3/agents',
    )
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({
      api_access_token: 'admin-verification-token',
    })
  })
})
