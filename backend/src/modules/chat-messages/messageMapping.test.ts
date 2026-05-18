import { describe, expect, it } from 'vitest'

import { mapPortalMessage } from './messageMapping.js'

describe('mapPortalMessage', () => {
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
