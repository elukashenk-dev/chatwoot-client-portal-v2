import { describe, expect, it, vi } from 'vitest'

import { createChatwootClient } from './client.js'

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  })
}

describe('createChatwootClient', () => {
  it('returns an exact email match from Chatwoot search results', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        payload: [
          {
            email: 'other@company.ru',
            id: 4,
            name: 'Other User',
          },
          {
            email: 'Name@Company.RU',
            id: 7,
            name: 'Portal User',
          },
        ],
      }),
    )
    const client = createChatwootClient({
      env: {
        CHATWOOT_ACCOUNT_ID: 3,
        CHATWOOT_API_ACCESS_TOKEN: 'token',
        CHATWOOT_BASE_URL: 'http://127.0.0.1:3000/',
        CHATWOOT_PORTAL_INBOX_ID: 9,
      },
      fetchFn,
    })

    const contact = await client.findContactByEmail(' name@company.ru ')

    expect(contact).toEqual({
      email: 'Name@Company.RU',
      id: 7,
      name: 'Portal User',
    })
    expect(fetchFn).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        headers: expect.objectContaining({
          api_access_token: 'token',
        }),
        method: 'GET',
      }),
    )
  })

  it('returns null when Chatwoot search does not include an exact email match', async () => {
    const client = createChatwootClient({
      env: {
        CHATWOOT_ACCOUNT_ID: 3,
        CHATWOOT_API_ACCESS_TOKEN: 'token',
        CHATWOOT_BASE_URL: 'http://127.0.0.1:3000',
        CHATWOOT_PORTAL_INBOX_ID: 9,
      },
      fetchFn: vi.fn<typeof fetch>().mockResolvedValue(
        createJsonResponse({
          payload: [
            {
              email: 'other@company.ru',
              id: 4,
              name: 'Other User',
            },
          ],
        }),
      ),
    })

    await expect(
      client.findContactByEmail('name@company.ru'),
    ).resolves.toBeNull()
  })

  it('lists only configured API inbox conversations for a contact', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        payload: [
          {
            created_at: 100,
            id: 11,
            inbox_id: 9,
            last_activity_at: 150,
            meta: {
              assignee: {
                name: 'Анна Смирнова',
              },
              channel: 'Channel::Api',
            },
            status: 'open',
          },
          {
            created_at: 101,
            id: 12,
            inbox_id: 10,
            last_activity_at: 151,
            meta: {
              channel: 'Channel::Api',
            },
            status: 'open',
          },
          {
            created_at: 102,
            id: 13,
            inbox_id: 9,
            last_activity_at: 152,
            meta: {
              channel: 'Channel::WebWidget',
            },
            status: 'open',
          },
        ],
      }),
    )
    const client = createChatwootClient({
      env: {
        CHATWOOT_ACCOUNT_ID: 3,
        CHATWOOT_API_ACCESS_TOKEN: 'token',
        CHATWOOT_BASE_URL: 'http://127.0.0.1:3000',
        CHATWOOT_PORTAL_INBOX_ID: 9,
      },
      fetchFn,
    })

    await expect(client.listContactConversations(7)).resolves.toEqual([
      {
        assigneeName: 'Анна Смирнова',
        channelType: 'Channel::Api',
        createdAt: 100,
        id: 11,
        inboxId: 9,
        lastActivityAt: 150,
        status: 'open',
      },
    ])
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      'http://127.0.0.1:3000/api/v1/accounts/3/contacts/7/conversations',
    )
  })

  it('recovers configured API inbox conversations when the contact conversation page is capped', async () => {
    const cappedConversations = Array.from({ length: 20 }, (_, index) => ({
      created_at: 100 + index,
      id: 100 + index,
      inbox_id: 10,
      last_activity_at: 200 + index,
      meta: {
        channel: 'Channel::Api',
      },
      status: 'resolved',
    }))
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        createJsonResponse({
          payload: cappedConversations,
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          payload: {
            contact_inboxes: [
              {
                inbox: {
                  id: 9,
                },
                source_id: 'portal-contact-source',
              },
            ],
            id: 7,
          },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          data: {
            meta: {
              all_count: 1,
            },
            payload: [
              {
                created_at: 50,
                id: 77,
                inbox_id: 9,
                last_activity_at: 75,
                meta: {
                  channel: 'Channel::Api',
                },
                status: 'resolved',
              },
            ],
          },
        }),
      )
    const client = createChatwootClient({
      env: {
        CHATWOOT_ACCOUNT_ID: 3,
        CHATWOOT_API_ACCESS_TOKEN: 'token',
        CHATWOOT_BASE_URL: 'http://127.0.0.1:3000',
        CHATWOOT_PORTAL_INBOX_ID: 9,
      },
      fetchFn,
    })

    await expect(client.listContactConversations(7)).resolves.toEqual([
      {
        assigneeName: null,
        channelType: 'Channel::Api',
        createdAt: 50,
        id: 77,
        inboxId: 9,
        lastActivityAt: 75,
        status: 'resolved',
      },
    ])
    expect(String(fetchFn.mock.calls[2]?.[0])).toBe(
      'http://127.0.0.1:3000/api/v1/accounts/3/conversations?status=all&source_id=portal-contact-source&page=1',
    )
  })

  it('keeps portal inbox routing unchanged when it already reopens the same conversation', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        channel_type: 'Channel::Api',
        id: 9,
        lock_to_single_conversation: true,
      }),
    )
    const client = createChatwootClient({
      env: {
        CHATWOOT_ACCOUNT_ID: 3,
        CHATWOOT_API_ACCESS_TOKEN: 'token',
        CHATWOOT_BASE_URL: 'http://127.0.0.1:3000',
        CHATWOOT_PORTAL_INBOX_ID: 9,
      },
      fetchFn,
    })

    await expect(
      client.ensurePortalInboxSingleConversationRouting(),
    ).resolves.toEqual({
      channelType: 'Channel::Api',
      id: 9,
      lockToSingleConversation: true,
      updated: false,
    })
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('enables portal inbox routing when it was changed to create new conversations', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        createJsonResponse({
          channel_type: 'Channel::Api',
          id: 9,
          lock_to_single_conversation: false,
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          channel_type: 'Channel::Api',
          id: 9,
          lock_to_single_conversation: true,
        }),
      )
    const client = createChatwootClient({
      env: {
        CHATWOOT_ACCOUNT_ID: 3,
        CHATWOOT_API_ACCESS_TOKEN: 'token',
        CHATWOOT_BASE_URL: 'http://127.0.0.1:3000',
        CHATWOOT_PORTAL_INBOX_ID: 9,
      },
      fetchFn,
    })

    await expect(
      client.ensurePortalInboxSingleConversationRouting(),
    ).resolves.toEqual({
      channelType: 'Channel::Api',
      id: 9,
      lockToSingleConversation: true,
      updated: true,
    })
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      expect.any(URL),
      expect.objectContaining({
        body: JSON.stringify({
          lock_to_single_conversation: true,
        }),
        method: 'PATCH',
      }),
    )
  })

  it('lists bounded conversation messages with internal-message filtering', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        payload: [
          {
            attachments: [],
            content: 'Agent reply',
            content_type: 'text',
            created_at: 1_776_000_001,
            id: 21,
            message_type: 1,
            private: false,
            sender: {
              id: 5,
              name: 'Анна Смирнова',
              type: 'user',
            },
            status: 'sent',
          },
          {
            attachments: [],
            content: 'Portal message',
            content_type: 'text',
            created_at: 1_776_000_002,
            id: 22,
            message_type: 0,
            private: false,
            sender: {
              id: 7,
              name: 'Portal User',
              type: 'contact',
            },
            status: 'sent',
          },
        ],
      }),
    )
    const client = createChatwootClient({
      env: {
        CHATWOOT_ACCOUNT_ID: 3,
        CHATWOOT_API_ACCESS_TOKEN: 'token',
        CHATWOOT_BASE_URL: 'http://127.0.0.1:3000',
        CHATWOOT_PORTAL_INBOX_ID: 9,
      },
      fetchFn,
    })

    await expect(client.listConversationMessages(101)).resolves.toMatchObject({
      hasMoreOlder: false,
      messages: [
        {
          content: 'Agent reply',
          id: 21,
          messageType: 1,
        },
        {
          content: 'Portal message',
          id: 22,
          messageType: 0,
        },
      ],
      nextOlderCursor: null,
    })

    const requestUrl = fetchFn.mock.calls[0]?.[0]

    expect(requestUrl).toBeInstanceOf(URL)
    expect(
      (requestUrl as URL).searchParams.get('filter_internal_messages'),
    ).toBe('true')
  })

  it('creates a contact inbox in the configured portal inbox', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        inbox: {
          id: 9,
        },
        source_id: 'portal-contact-source',
      }),
    )
    const client = createChatwootClient({
      env: {
        CHATWOOT_ACCOUNT_ID: 3,
        CHATWOOT_API_ACCESS_TOKEN: 'token',
        CHATWOOT_BASE_URL: 'http://127.0.0.1:3000',
        CHATWOOT_PORTAL_INBOX_ID: 9,
      },
      fetchFn,
    })

    await expect(
      client.createContactInbox({
        contactId: 7,
        sourceId: 'portal-contact-source',
      }),
    ).resolves.toEqual({
      inboxId: 9,
      sourceId: 'portal-contact-source',
    })
    expect(fetchFn).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        body: JSON.stringify({
          inbox_id: 9,
          source_id: 'portal-contact-source',
        }),
        method: 'POST',
      }),
    )
  })

  it('creates a portal conversation from a contact inbox source id', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        id: 301,
        inbox_id: 9,
      }),
    )
    const client = createChatwootClient({
      env: {
        CHATWOOT_ACCOUNT_ID: 3,
        CHATWOOT_API_ACCESS_TOKEN: 'token',
        CHATWOOT_BASE_URL: 'http://127.0.0.1:3000',
        CHATWOOT_PORTAL_INBOX_ID: 9,
      },
      fetchFn,
    })

    await expect(
      client.createConversation({
        contactId: 7,
        sourceId: 'portal-contact-source',
      }),
    ).resolves.toMatchObject({
      channelType: 'Channel::Api',
      id: 301,
      inboxId: 9,
      status: 'open',
    })
    expect(fetchFn).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        body: JSON.stringify({
          contact_id: 7,
          inbox_id: 9,
          source_id: 'portal-contact-source',
          status: 'open',
        }),
        method: 'POST',
      }),
    )
  })

  it('creates an incoming customer-authored message with a source id', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        attachments: [],
        content: 'Portal text',
        content_attributes: {},
        content_type: 'text',
        created_at: 1_776_000_010,
        id: 501,
        message_type: 0,
        private: false,
        sender: {
          id: 7,
          name: 'Portal User',
          type: 'contact',
        },
        source_id: 'portal-send:test-key',
        status: 'sent',
      }),
    )
    const client = createChatwootClient({
      env: {
        CHATWOOT_ACCOUNT_ID: 3,
        CHATWOOT_API_ACCESS_TOKEN: 'token',
        CHATWOOT_BASE_URL: 'http://127.0.0.1:3000',
        CHATWOOT_PORTAL_INBOX_ID: 9,
      },
      fetchFn,
    })

    await expect(
      client.createConversationIncomingMessage({
        content: ' Portal text ',
        conversationId: 101,
        sourceId: 'portal-send:test-key',
      }),
    ).resolves.toMatchObject({
      content: 'Portal text',
      id: 501,
      messageType: 0,
      sourceId: 'portal-send:test-key',
    })
    expect(fetchFn).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        body: JSON.stringify({
          content: 'Portal text',
          content_attributes: {},
          content_type: 'text',
          message_type: 'incoming',
          private: false,
          source_id: 'portal-send:test-key',
        }),
        method: 'POST',
      }),
    )
  })

  it('creates an incoming customer-authored attachment message with multipart form data', async () => {
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
        content: null,
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
      env: {
        CHATWOOT_ACCOUNT_ID: 3,
        CHATWOOT_API_ACCESS_TOKEN: 'token',
        CHATWOOT_BASE_URL: 'http://127.0.0.1:3000',
        CHATWOOT_PORTAL_INBOX_ID: 9,
      },
      fetchFn,
    })

    await expect(
      client.createConversationIncomingAttachmentMessage({
        attachment: {
          data: new Uint8Array([1, 2, 3]),
          fileName: ' invoice.pdf ',
          mimeType: 'Application/PDF',
        },
        conversationId: 101,
        sourceId: 'portal-send:attachment-key',
      }),
    ).resolves.toMatchObject({
      attachments: [
        {
          name: 'invoice.pdf',
          url: 'https://files.example.test/invoice.pdf',
        },
      ],
      content: null,
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
    expect(formData.get('message_type')).toBe('incoming')
    expect(formData.get('private')).toBe('false')
    expect(formData.get('source_id')).toBe('portal-send:attachment-key')
    expect(formData.get('attachments[]')).toBeInstanceOf(Blob)
  })
})
