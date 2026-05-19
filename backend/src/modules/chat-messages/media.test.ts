import { describe, expect, it } from 'vitest'

import { buildPortalChatMediaItems, getMediaItemCategory } from './media.js'
import type { PortalChatMessage } from './types.js'

function createMessage(
  overrides: Partial<PortalChatMessage> = {},
): PortalChatMessage {
  return {
    attachments: [],
    authorAvatarUrl: null,
    authorName: 'Ольга Support',
    authorRole: 'agent',
    clientMessageKey: null,
    content: 'Файлы по заявке',
    contentType: 'text',
    createdAt: '2026-05-19T10:20:00.000Z',
    direction: 'incoming',
    id: 501,
    replyTo: null,
    status: 'sent',
    ...overrides,
  }
}

describe('chat media mapping', () => {
  it('flattens message attachments into stable media items', () => {
    expect(
      buildPortalChatMediaItems([
        createMessage({
          attachments: [
            {
              fileSize: 2048,
              fileType: 'image',
              id: 91,
              name: 'receipt.png',
              thumbUrl:
                '/api/chat/threads/private%3Ame/attachments/501/91/thumb',
              url: '/api/chat/threads/private%3Ame/attachments/501/91',
            },
            {
              fileSize: null,
              fileType: 'application/pdf',
              id: 92,
              name: 'contract.pdf',
              thumbUrl: '',
              url: '/api/chat/threads/private%3Ame/attachments/501/92',
            },
          ],
        }),
      ]),
    ).toEqual([
      {
        attachmentId: 91,
        authorName: 'Ольга Support',
        authorRole: 'agent',
        category: 'image',
        createdAt: '2026-05-19T10:20:00.000Z',
        direction: 'incoming',
        fileSize: 2048,
        fileType: 'image',
        id: 'attachment:501:91',
        messageId: 501,
        name: 'receipt.png',
        thumbUrl: '/api/chat/threads/private%3Ame/attachments/501/91/thumb',
        url: '/api/chat/threads/private%3Ame/attachments/501/91',
      },
      {
        attachmentId: 92,
        authorName: 'Ольга Support',
        authorRole: 'agent',
        category: 'file',
        createdAt: '2026-05-19T10:20:00.000Z',
        direction: 'incoming',
        fileSize: null,
        fileType: 'application/pdf',
        id: 'attachment:501:92',
        messageId: 501,
        name: 'contract.pdf',
        thumbUrl: '',
        url: '/api/chat/threads/private%3Ame/attachments/501/92',
      },
    ])
  })

  it('omits messages without attachments', () => {
    expect(
      buildPortalChatMediaItems([
        createMessage(),
        createMessage({
          attachments: [
            {
              fileSize: 1200,
              fileType: 'audio',
              id: 93,
              name: 'voice-message.webm',
              thumbUrl: '',
              url: '/api/chat/threads/private%3Ame/attachments/502/93',
            },
          ],
          id: 502,
        }),
      ]),
    ).toHaveLength(1)
  })

  it('classifies media categories from Chatwoot file types', () => {
    expect(getMediaItemCategory('image')).toBe('image')
    expect(getMediaItemCategory('image/png')).toBe('image')
    expect(getMediaItemCategory('video')).toBe('video')
    expect(getMediaItemCategory('video/mp4')).toBe('video')
    expect(getMediaItemCategory('audio')).toBe('audio')
    expect(getMediaItemCategory('audio/webm')).toBe('audio')
    expect(getMediaItemCategory('application/pdf')).toBe('file')
    expect(getMediaItemCategory('file')).toBe('file')
  })
})
