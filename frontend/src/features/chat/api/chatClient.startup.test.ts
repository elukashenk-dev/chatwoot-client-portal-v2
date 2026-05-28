import { afterEach, describe, expect, it, vi } from 'vitest'

import { getChatMessages, getChatThreads } from './chatClient'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
    },
    status,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('chat startup API client', () => {
  it('passes abort signals to startup read requests', async () => {
    const signal = new AbortController().signal
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          activeThreadId: 'private:me',
          threads: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          activeThread: null,
          hasMoreOlder: false,
          messages: [],
          nextOlderCursor: null,
          reason: 'none',
          result: 'ready',
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await getChatThreads({ signal })
    await getChatMessages({ signal, threadId: 'private:me' })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/chat/threads',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
        signal,
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/chat/messages?threadId=private%3Ame',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
        signal,
      }),
    )
  })
})
