import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { sendChatAttachments } from './chatClient'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

it('sends an ordered attachment batch as repeated multipart fields', async () => {
  const first = new File(['first'], 'first.pdf', {
    type: 'application/pdf',
  })
  const second = new File(['second'], 'second.txt', {
    type: 'text/plain',
  })

  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        activeThread: {
          id: 'private:me',
          subtitle: 'Вы и поддержка',
          title: 'Личный чат',
          type: 'private',
        },
        reason: 'none',
        result: 'ready',
        sentMessage: null,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
        },
        status: 200,
      },
    ),
  )

  await sendChatAttachments({
    attachments: [first, second],
    clientMessageKey: 'portal-send:batch',
    content: 'Документы',
    replyToMessageId: 77,
    threadId: 'private:me',
  })

  expect(fetchMock).toHaveBeenCalledTimes(1)

  const [url, options] = fetchMock.mock.calls[0] ?? []
  const formData = options?.body as FormData

  expect(url).toBe('/api/chat/messages/attachments')
  expect(options).toEqual(
    expect.objectContaining({
      credentials: 'include',
      method: 'POST',
    }),
  )
  expect(options?.headers).toBeUndefined()
  expect(formData.getAll('attachments')).toHaveLength(2)
  expect(
    formData.getAll('attachments').map((file) => (file as File).name),
  ).toEqual(['first.pdf', 'second.txt'])
  expect(formData.get('clientMessageKey')).toBe('portal-send:batch')
  expect(formData.get('content')).toBe('Документы')
  expect(formData.get('replyToMessageId')).toBe('77')
  expect(formData.get('threadId')).toBe('private:me')
})
