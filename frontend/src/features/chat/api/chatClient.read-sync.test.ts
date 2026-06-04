import { afterEach, describe, expect, it, vi } from 'vitest'

import { markChatThreadRead } from './chatClient'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('chat read sync API client', () => {
  it('posts mark-read through the backend authority boundary', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 204,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await markChatThreadRead('private:me')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chat/threads/private%3Ame/read',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
      }),
    )
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty('body')
  })
})
