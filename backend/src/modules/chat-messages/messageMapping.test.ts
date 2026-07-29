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

  it('maps agent avatars to portal-authorized proxy URLs', () => {
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
      authorAvatarUrl: '/api/chat/threads/private%3Ame/messages/502/avatar',
      authorName: 'Support',
      authorRole: 'agent',
    })
  })

  it('uses the tenant icon as the agent avatar fallback when Chatwoot has no sender photo', () => {
    const message = mapPortalMessage(
      {
        attachments: [],
        content: 'Agent reply',
        contentAttributes: {},
        contentType: 'text',
        createdAt: 1_779_107_173,
        id: 503,
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
        threadId: 'private:me',
        threadType: 'private',
      },
    )

    expect(message).toMatchObject({
      authorAvatarUrl: '/api/tenant/icons/icon-192.png',
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

  it('hides the user scope from a current portal-send source id', () => {
    const message = mapPortalMessage(
      {
        attachments: [],
        content: 'Привет',
        contentAttributes: {},
        contentType: 'text',
        createdAt: 1_779_107_173,
        id: 1142,
        messageType: 0,
        private: false,
        sender: {
          id: 33,
          name: 'Alex',
          type: 'contact',
        },
        sourceId: 'portal-user-send:v1:13:portal-send:browser-key',
        status: 'failed',
      },
      {
        currentUserId: 13,
        threadId: 'private:me',
        threadType: 'private',
      },
    )

    expect(message).toMatchObject({
      clientMessageKey: 'portal-send:browser-key',
      direction: 'outgoing',
      status: 'sent',
    })
  })

  it('keeps a legacy portal-send key that begins with the old v2-looking prefix', () => {
    const message = mapPortalMessage(
      {
        attachments: [],
        content: 'Привет',
        contentAttributes: {},
        contentType: 'text',
        createdAt: 1_779_107_173,
        id: 1143,
        messageType: 0,
        private: false,
        sender: {
          id: 33,
          name: 'Alex',
          type: 'contact',
        },
        sourceId: 'portal-send:v2:13:portal-send:historical-key',
        status: 'failed',
      },
      {
        currentUserId: 13,
        threadId: 'private:me',
        threadType: 'private',
      },
    )

    expect(message).toMatchObject({
      clientMessageKey: 'portal-send:v2:13:portal-send:historical-key',
      direction: 'outgoing',
      status: 'sent',
    })
  })

  it('does not accept a non-canonical user scope in a current source id', () => {
    const message = mapPortalMessage(
      {
        attachments: [],
        content: 'Привет',
        contentAttributes: {},
        contentType: 'text',
        createdAt: 1_779_107_173,
        id: 1144,
        messageType: 0,
        private: false,
        sender: {
          id: 33,
          name: 'Alex',
          type: 'contact',
        },
        sourceId: 'portal-user-send:v1:1e2:portal-send:browser-key',
        status: 'failed',
      },
      {
        currentUserId: 13,
        threadId: 'private:me',
        threadType: 'private',
      },
    )

    expect(message).toMatchObject({
      clientMessageKey: null,
      direction: 'outgoing',
      status: 'failed',
    })
  })

  it('strips a CRLF group author prefix from a current-user attachment caption', () => {
    const message = mapPortalMessage(
      {
        attachments: [
          {
            extension: 'jpg',
            fileSize: 479_232,
            fileType: 'image',
            id: 92,
            messageId: 703,
            name: 'shared-image.jpg',
            thumbUrl: '',
            url: 'https://chatwoot.test/rails/active_storage/file',
          },
        ],
        content: '**Эдуард**\r\nПроверка',
        contentAttributes: {},
        contentType: 'text',
        createdAt: 1_779_107_173,
        id: 703,
        messageType: 0,
        private: false,
        sender: {
          id: 154,
          name: 'ООО "Ромашка"',
          type: 'contact',
        },
        sourceId: 'portal-user-send:v1:7:portal-send:attachment-key',
        status: 'sent',
      },
      {
        currentUserId: 7,
        ledgerAuthorsByMessageId: new Map([
          [
            703,
            {
              authorDisplayName: 'Эдуард',
              userId: 7,
            },
          ],
        ]),
        threadId: 'group:154',
        threadType: 'group',
      },
    )

    expect(message).toMatchObject({
      authorName: 'Вы',
      authorRole: 'current_user',
      content: 'Проверка',
      direction: 'outgoing',
    })
  })

  it('maps ledger-known group member avatars to portal participant avatar URLs', () => {
    const message = mapPortalMessage(
      {
        attachments: [],
        content: '**Мария Соколова**\nДобрый день',
        contentAttributes: {},
        contentType: 'text',
        createdAt: 1_779_107_173,
        id: 701,
        messageType: 0,
        private: false,
        sender: {
          id: 154,
          name: 'ООО "Ромашка"',
          type: 'contact',
        },
        sourceId: 'portal-send:member-key',
        status: 'sent',
      },
      {
        currentUserId: 7,
        ledgerAuthorsByMessageId: new Map([
          [
            701,
            {
              authorDisplayName: 'Мария Соколова',
              userId: 8,
            },
          ],
        ]),
        threadId: 'group:154',
        threadType: 'group',
      },
    )

    expect(message).toMatchObject({
      authorAvatarUrl: '/api/chat/threads/group%3A154/participants/8/avatar',
      authorName: 'Мария Соколова',
      authorRole: 'group_member',
      direction: 'incoming',
    })
  })

  it('does not infer group member avatars from parsed author names', () => {
    const message = mapPortalMessage(
      {
        attachments: [],
        content: '**Мария Соколова**\nДобрый день',
        contentAttributes: {},
        contentType: 'text',
        createdAt: 1_779_107_173,
        id: 702,
        messageType: 0,
        private: false,
        sender: {
          id: 154,
          name: 'ООО "Ромашка"',
          type: 'contact',
        },
        sourceId: null,
        status: 'sent',
      },
      {
        currentUserId: 7,
        ledgerAuthorsByMessageId: new Map(),
        threadId: 'group:154',
        threadType: 'group',
      },
    )

    expect(message).toMatchObject({
      authorAvatarUrl: null,
      authorName: 'Мария Соколова',
      authorRole: 'group_member',
    })
  })
})
