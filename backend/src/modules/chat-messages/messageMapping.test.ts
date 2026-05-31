import { describe, expect, it } from 'vitest'

import { mapPortalMessage } from './messageMapping.js'

describe('mapPortalMessage', () => {
  it('maps attachments to portal-authorized proxy URLs', () => {
    const message = mapPortalMessage(
      {
        attachments: [
          {
            extension: 'png',
            fileSize: 2048,
            fileType: 'image',
            id: 91,
            messageId: 501,
            name: 'receipt.png',
            thumbUrl: 'https://chatwoot.test/rails/active_storage/thumb',
            url: 'https://chatwoot.test/rails/active_storage/file',
          },
        ],
        content: null,
        contentAttributes: {},
        contentType: 'text',
        createdAt: 1_779_107_173,
        id: 501,
        messageType: 1,
        private: false,
        sender: {
          id: 8,
          name: 'Support',
          type: 'user',
        },
        sourceId: null,
        status: 'sent',
      },
      {
        currentUserId: 13,
        threadId: 'group:154',
        threadType: 'group',
      },
    )

    expect(message?.attachments[0]).toMatchObject({
      id: 91,
      thumbUrl: '/api/chat/threads/group%3A154/attachments/501/91/thumb',
      url: '/api/chat/threads/group%3A154/attachments/501/91',
    })
  })

  it('does not expose direct Chatwoot agent avatar URLs', () => {
    const message = mapPortalMessage(
      {
        attachments: [],
        content: 'Agent reply',
        contentAttributes: {},
        contentType: 'text',
        createdAt: 1_779_107_173,
        id: 502,
        messageType: 1,
        private: false,
        sender: {
          avatarUrl: 'https://chatwoot.test/rails/active_storage/avatar.png',
          id: 8,
          name: 'Support',
          type: 'user',
        },
        sourceId: null,
        status: 'sent',
      },
      {
        currentUserId: 13,
        threadId: 'private:me',
        threadType: 'private',
      },
    )

    expect(message).toMatchObject({
      authorAvatarUrl: null,
      authorName: 'Support',
      authorRole: 'agent',
    })
  })

  it('normalizes confirmed portal-send outgoing messages to sent even when Chatwoot reports failed delivery status', () => {
    const message = mapPortalMessage(
      {
        attachments: [],
        content: 'Привет',
        contentAttributes: {},
        contentType: 'text',
        createdAt: 1_779_107_173,
        id: 1141,
        messageType: 0,
        private: false,
        sender: {
          id: 33,
          name: 'Alex',
          type: 'contact',
        },
        sourceId: 'portal-send:mpb6h45z-x37seo47hl',
        status: 'failed',
      },
      {
        currentUserId: 13,
        threadId: 'private:me',
        threadType: 'private',
      },
    )

    expect(message).toMatchObject({
      clientMessageKey: 'portal-send:mpb6h45z-x37seo47hl',
      direction: 'outgoing',
      status: 'sent',
    })
  })
})
