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

describe('Chatwoot attachment message create', () => {
  it('creates one ordered multipart request for an attachment batch', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        attachments: [
          {
            data_url: 'https://files.example.test/invoice.pdf',
            extension: 'pdf',
            fallback_title: 'invoice.pdf',
            file_size: 1024,
            file_type: 'file',
            id: 77,
            message_id: 601,
            thumb_url: '',
          },
        ],
        content: 'Подпишите, пожалуйста',
        content_attributes: {},
        content_type: 'text',
        created_at: 1_776_000_020,
        id: 601,
        message_type: 0,
        private: false,
        sender: {
          id: 7,
          name: 'Portal User',
          type: 'contact',
        },
        source_id: 'portal-send:attachment-key',
        status: 'sent',
      }),
    )
    const client = createChatwootClient({
      config: testChatwootConfig,
      fetchFn,
    })

    await expect(
      client.createConversationIncomingAttachmentMessage({
        attachments: [
          {
            data: new Uint8Array([1, 2, 3]),
            fileName: ' invoice.pdf ',
            mimeType: 'Application/PDF',
          },
          {
            data: new Uint8Array([4, 5]),
            fileName: ' notes.txt ',
            mimeType: 'Text/Plain',
          },
        ],
        content: ' Подпишите, пожалуйста ',
        conversationId: 101,
        replyToMessageId: 401,
        sourceId: 'portal-send:attachment-key',
      }),
    ).resolves.toMatchObject({
      attachments: [
        {
          name: 'invoice.pdf',
          url: 'https://files.example.test/invoice.pdf',
        },
      ],
      content: 'Подпишите, пожалуйста',
      id: 601,
      messageType: 0,
      sourceId: 'portal-send:attachment-key',
    })

    const [, requestOptions] = fetchFn.mock.calls[0] ?? []
    const formData = requestOptions?.body as FormData

    expect(requestOptions).toMatchObject({
      headers: {
        Accept: 'application/json',
        api_access_token: 'token',
      },
      method: 'POST',
    })
    expect(requestOptions?.headers).not.toHaveProperty('Content-Type')
    expect(formData).toBeInstanceOf(FormData)
    expect(formData.get('content')).toBe('Подпишите, пожалуйста')
    expect(formData.get('message_type')).toBe('incoming')
    expect(formData.get('content_attributes')).toBe('{"in_reply_to":401}')
    expect(formData.get('private')).toBe('false')
    expect(formData.get('source_id')).toBe('portal-send:attachment-key')
    const files = formData.getAll('attachments[]')

    expect(files).toHaveLength(2)
    expect(files.map((file) => (file as File).name)).toEqual([
      'invoice.pdf',
      'notes.txt',
    ])
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it.each([
    {
      attachments: [],
      name: 'an empty attachment batch',
    },
    {
      attachments: Array.from({ length: 6 }, (_, index) => ({
        data: new Uint8Array([index + 1]),
        fileName: `file-${index}.txt`,
        mimeType: 'text/plain',
      })),
      name: 'more than five attachments',
    },
  ])('rejects $name before calling Chatwoot', async ({ attachments }) => {
    const fetchFn = vi.fn<typeof fetch>()
    const client = createChatwootClient({
      config: testChatwootConfig,
      fetchFn,
    })

    await expect(
      client.createConversationIncomingAttachmentMessage({
        attachments,
        conversationId: 101,
      }),
    ).rejects.toMatchObject({
      message:
        'Chatwoot attachment send requires between one and five files.',
      name: 'ChatwootClientRequestError',
    })
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
