import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { ChatApiClientError, sendChatMessage } from './chatClient'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

function createRateLimitedResponse(retryAfter: string | null) {
  const headers = new Headers({
    'Content-Type': 'application/json',
  })

  if (retryAfter !== null) {
    headers.set('Retry-After', retryAfter)
  }

  return new Response(
    JSON.stringify({
      error: {
        code: 'CHAT_SEND_RATE_LIMITED',
        message: 'Слишком много сообщений. Попробуйте позже.',
      },
    }),
    {
      headers,
      status: 429,
    },
  )
}

it('exposes numeric retry-after seconds for chat send rate limits', async () => {
  fetchMock.mockResolvedValueOnce(createRateLimitedResponse('7'))

  await expect(
    sendChatMessage({
      clientMessageKey: 'portal-send:retry-after',
      content: 'Queued text',
      replyToMessageId: null,
      threadId: 'private:me',
    }),
  ).rejects.toMatchObject({
    code: 'CHAT_SEND_RATE_LIMITED',
    retryAfterSeconds: 7,
    statusCode: 429,
  } satisfies Partial<ChatApiClientError>)
})

it('falls back to null retry-after metadata when the header is invalid', async () => {
  fetchMock.mockResolvedValueOnce(createRateLimitedResponse('not-a-delay'))

  await expect(
    sendChatMessage({
      clientMessageKey: 'portal-send:invalid-retry-after',
      content: 'Queued text',
      replyToMessageId: null,
      threadId: 'private:me',
    }),
  ).rejects.toMatchObject({
    code: 'CHAT_SEND_RATE_LIMITED',
    retryAfterSeconds: null,
    statusCode: 429,
  } satisfies Partial<ChatApiClientError>)
})
