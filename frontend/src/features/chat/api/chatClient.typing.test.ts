import { afterEach, describe, expect, it, vi } from 'vitest'

import { setChatThreadTyping } from './chatClient'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('chat typing API client', () => {
  it('posts typing status through the backend authority boundary', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 204,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await setChatThreadTyping({
      threadId: 'private:me',
      typingStatus: 'on',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chat/threads/private%3Ame/typing',
      expect.objectContaining({
        body: JSON.stringify({ typingStatus: 'on' }),
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    )
  })
})
