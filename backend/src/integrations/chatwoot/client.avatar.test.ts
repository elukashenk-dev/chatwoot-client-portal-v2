import { describe, expect, it, vi } from 'vitest'

import { createChatwootClient } from './client.js'

const testChatwootConfig = {
  accountId: 3,
  apiAccessToken: 'token',
  baseUrl: 'http://127.0.0.1:3000',
  portalInboxId: 9,
}

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  })
}

describe('createChatwootClient contact avatars', () => {
  it('updates a contact avatar with multipart form data', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        payload: {
          id: 44,
        },
      }),
    )
    const client = createChatwootClient({
      config: testChatwootConfig,
      fetchFn,
    })

    await expect(
      client.updateContactAvatar(44, {
        data: Buffer.from('avatar-bytes'),
        fileName: 'avatar.png',
        mimeType: 'image/png',
      }),
    ).resolves.toBe(true)

    const [requestUrl, requestOptions] = fetchFn.mock.calls[0] ?? []
    const formData = requestOptions?.body as FormData

    expect(String(requestUrl)).toBe(
      'http://127.0.0.1:3000/api/v1/accounts/3/contacts/44',
    )
    expect(requestOptions).toMatchObject({
      headers: {
        Accept: 'application/json',
        api_access_token: 'token',
      },
      method: 'PUT',
    })
    expect(requestOptions?.headers).not.toHaveProperty('Content-Type')
    expect(formData).toBeInstanceOf(FormData)
    expect(formData.get('avatar')).toBeInstanceOf(Blob)
  })
})
