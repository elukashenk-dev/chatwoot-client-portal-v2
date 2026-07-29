import { afterEach, expect, it, vi } from 'vitest'

import { sendChatAttachmentRequest } from './chatAttachmentTransport'
import { sendChatAttachments } from './chatClient'

vi.mock('./chatAttachmentTransport', async () => {
  const actual = await vi.importActual<
    typeof import('./chatAttachmentTransport')
  >('./chatAttachmentTransport')

  return {
    ...actual,
    sendChatAttachmentRequest: vi.fn(),
  }
})

const sendChatAttachmentRequestMock = vi.mocked(sendChatAttachmentRequest)

afterEach(() => {
  sendChatAttachmentRequestMock.mockReset()
})

it('sends an ordered attachment batch as repeated multipart fields', async () => {
  const first = new File(['first'], 'first.pdf', {
    type: 'application/pdf',
  })
  const second = new File(['second'], 'second.txt', {
    type: 'text/plain',
  })

  sendChatAttachmentRequestMock.mockResolvedValueOnce({
    activeThread: {
      id: 'private:me',
      subtitle: 'Вы и поддержка',
      title: 'Личный чат',
      type: 'private',
    },
    reason: 'none',
    result: 'ready',
    sentMessage: null,
  })

  await sendChatAttachments({
    attachments: [first, second],
    clientMessageKey: 'portal-send:batch',
    content: 'Документы',
    replyToMessageId: 77,
    threadId: 'private:me',
  })

  expect(sendChatAttachmentRequestMock).toHaveBeenCalledTimes(1)

  const request = sendChatAttachmentRequestMock.mock.calls[0]?.[0]
  const formData = request?.formData as FormData

  expect(request).toEqual(
    expect.objectContaining({
      url: '/api/chat/messages/attachments',
    }),
  )
  expect(formData.getAll('attachments')).toHaveLength(2)
  expect(
    formData.getAll('attachments').map((file) => (file as File).name),
  ).toEqual(['first.pdf', 'second.txt'])
  expect(formData.get('clientMessageKey')).toBe('portal-send:batch')
  expect(formData.get('content')).toBe('Документы')
  expect(formData.get('replyToMessageId')).toBe('77')
  expect(formData.get('threadId')).toBe('private:me')
})
