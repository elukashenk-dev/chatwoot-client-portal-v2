import { describe, expect, it, vi } from 'vitest'

import { ChatwootClientRequestError } from './errors.js'
import { createChatwootPlatformClient } from './platformClient.js'

const testPlatformConfig = {
  apiAccessToken: 'platform-token-secret',
  baseUrl: 'https://chatwoot.example.com/',
}

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  })
}

function createEmptyResponse(status = 200) {
  return new Response(null, { status })
}

function readJsonBody(init: RequestInit | undefined) {
  return JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
}

describe('createChatwootPlatformClient', () => {
  it('creates an account through the Platform API', async () => {
    const fetchFn = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        createJsonResponse({
          custom_attributes: {
            portal_tenant_slug: 'client',
          },
          id: 101,
          name: 'Client Account',
        }),
      ),
    )
    const client = createChatwootPlatformClient({
      config: testPlatformConfig,
      fetchFn,
    })

    await expect(
      client.createAccount({
        customAttributes: {
          portal_tenant_slug: 'client',
        },
        name: 'Client Account',
      }),
    ).resolves.toEqual({
      customAttributes: {
        portal_tenant_slug: 'client',
      },
      id: 101,
      name: 'Client Account',
    })

    const [requestUrl, requestInit] = fetchFn.mock.calls[0] ?? []

    expect(requestUrl?.toString()).toBe(
      'https://chatwoot.example.com/platform/api/v1/accounts',
    )
    expect(requestInit?.method).toBe('POST')
    expect(requestInit?.headers).toMatchObject({
      'Content-Type': 'application/json',
      api_access_token: 'platform-token-secret',
    })
    expect(readJsonBody(requestInit)).toEqual({
      custom_attributes: {
        portal_tenant_slug: 'client',
      },
      name: 'Client Account',
    })
  })

  it('lists accounts and loads account details through the Platform API', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        createJsonResponse([
          {
            custom_attributes: {
              portal_tenant_slug: 'client-a',
            },
            id: 101,
            name: 'Client A',
          },
        ]),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          custom_attributes: {
            portal_tenant_slug: 'client-b',
          },
          id: 102,
          name: 'Client B',
        }),
      )
    const client = createChatwootPlatformClient({
      config: testPlatformConfig,
      fetchFn,
    })

    await expect(client.listAccounts()).resolves.toEqual([
      {
        customAttributes: {
          portal_tenant_slug: 'client-a',
        },
        id: 101,
        name: 'Client A',
      },
    ])
    await expect(client.getAccount(102)).resolves.toEqual({
      customAttributes: {
        portal_tenant_slug: 'client-b',
      },
      id: 102,
      name: 'Client B',
    })

    expect(fetchFn.mock.calls[0]?.[0]?.toString()).toBe(
      'https://chatwoot.example.com/platform/api/v1/accounts',
    )
    expect(fetchFn.mock.calls[0]?.[1]?.method).toBe('GET')
    expect(fetchFn.mock.calls[1]?.[0]?.toString()).toBe(
      'https://chatwoot.example.com/platform/api/v1/accounts/102',
    )
    expect(fetchFn.mock.calls[1]?.[1]?.method).toBe('GET')
  })

  it.each([200, 204])(
    'deletes an account through the Platform API with an empty %i response',
    async (status) => {
      const fetchFn = vi.fn<typeof fetch>(() =>
        Promise.resolve(createEmptyResponse(status)),
      )
      const client = createChatwootPlatformClient({
        config: testPlatformConfig,
        fetchFn,
      })

      await expect(client.deleteAccount(101)).resolves.toBeUndefined()

      expect(fetchFn.mock.calls[0]?.[0]?.toString()).toBe(
        'https://chatwoot.example.com/platform/api/v1/accounts/101',
      )
      expect(fetchFn.mock.calls[0]?.[1]?.method).toBe('DELETE')
      expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({
        api_access_token: 'platform-token-secret',
      })
    },
  )

  it('throws controlled delete errors without exposing upstream body secrets', async () => {
    const fetchFn = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        createJsonResponse(
          {
            access_token: 'user-access-token-secret',
            error: 'Invalid platform-token-secret',
          },
          401,
        ),
      ),
    )
    const client = createChatwootPlatformClient({
      config: testPlatformConfig,
      fetchFn,
    })

    const error = await client
      .deleteAccount(101)
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ChatwootClientRequestError)
    expect(String(error)).not.toContain('platform-token-secret')
    expect(String(error)).not.toContain('user-access-token-secret')
  })

  it('creates a user and maps snake_case response fields', async () => {
    const fetchFn = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        createJsonResponse({
          access_token: 'user-access-token-secret',
          custom_attributes: {
            portal_user_kind: 'client_admin',
          },
          email: 'admin@example.com',
          id: 201,
          name: 'Client Admin',
        }),
      ),
    )
    const client = createChatwootPlatformClient({
      config: testPlatformConfig,
      fetchFn,
    })

    await expect(
      client.createUser({
        customAttributes: {
          portal_user_kind: 'client_admin',
        },
        email: 'admin@example.com',
        name: 'Client Admin',
        password: 'Password2!',
      }),
    ).resolves.toEqual({
      accessToken: 'user-access-token-secret',
      email: 'admin@example.com',
      id: 201,
      name: 'Client Admin',
    })

    expect(fetchFn.mock.calls[0]?.[0]?.toString()).toBe(
      'https://chatwoot.example.com/platform/api/v1/users',
    )
    expect(fetchFn.mock.calls[0]?.[1]?.method).toBe('POST')
    expect(readJsonBody(fetchFn.mock.calls[0]?.[1])).toEqual({
      custom_attributes: {
        portal_user_kind: 'client_admin',
      },
      email: 'admin@example.com',
      name: 'Client Admin',
      password: 'Password2!',
    })
  })

  it('gets a user access token through the Platform API', async () => {
    const fetchFn = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        createJsonResponse({
          access_token: 'user-access-token-secret',
          expiry: null,
          user: {
            email: 'admin@example.com',
            id: 201,
            name: 'Client Admin',
          },
        }),
      ),
    )
    const client = createChatwootPlatformClient({
      config: testPlatformConfig,
      fetchFn,
    })

    await expect(client.getUserToken(201)).resolves.toBe(
      'user-access-token-secret',
    )
    expect(fetchFn.mock.calls[0]?.[0]?.toString()).toBe(
      'https://chatwoot.example.com/platform/api/v1/users/201/token',
    )
    expect(fetchFn.mock.calls[0]?.[1]?.method).toBe('POST')
  })

  it('adds a user to an account through the Platform API', async () => {
    const fetchFn = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        createJsonResponse({
          account_id: 101,
          role: 'administrator',
          user_id: 201,
        }),
      ),
    )
    const client = createChatwootPlatformClient({
      config: testPlatformConfig,
      fetchFn,
    })

    await expect(
      client.addAccountUser({
        accountId: 101,
        role: 'administrator',
        userId: 201,
      }),
    ).resolves.toBeUndefined()

    expect(fetchFn.mock.calls[0]?.[0]?.toString()).toBe(
      'https://chatwoot.example.com/platform/api/v1/accounts/101/account_users',
    )
    expect(fetchFn.mock.calls[0]?.[1]?.method).toBe('POST')
    expect(readJsonBody(fetchFn.mock.calls[0]?.[1])).toEqual({
      role: 'administrator',
      user_id: 201,
    })
  })

  it('throws controlled request errors without exposing platform or user tokens', async () => {
    const fetchFn = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        createJsonResponse(
          {
            access_token: 'user-access-token-secret',
            error: 'Invalid platform-token-secret',
          },
          401,
        ),
      ),
    )
    const client = createChatwootPlatformClient({
      config: testPlatformConfig,
      fetchFn,
    })

    await expect(
      client.createUser({
        customAttributes: {},
        email: 'admin@example.com',
        name: 'Client Admin',
        password: 'Password2!',
      }),
    ).rejects.toMatchObject({
      name: 'ChatwootClientRequestError',
    })

    const error = await client
      .createUser({
        customAttributes: {},
        email: 'admin@example.com',
        name: 'Client Admin',
        password: 'Password2!',
      })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ChatwootClientRequestError)
    expect(String(error)).not.toContain('platform-token-secret')
    expect(String(error)).not.toContain('user-access-token-secret')
  })
})
