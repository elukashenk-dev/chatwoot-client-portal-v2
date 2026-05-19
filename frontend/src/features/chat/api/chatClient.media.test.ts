import { afterEach, describe, expect, it, vi } from 'vitest'

import { getChatThreadMedia } from './chatClient'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getChatThreadMedia', () => {
  it('requests the encoded chat media endpoint with an optional cursor', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          activeThread: null,
          hasMoreOlder: false,
          items: [],
          nextOlderCursor: null,
          reason: 'none',
          result: 'ready',
        }),
        {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await getChatThreadMedia({
      beforeMessageId: 501,
      threadId: 'group:154',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chat/threads/group%3A154/media?beforeMessageId=501',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      }),
    )
  })
})
