import { describe, expect, it } from 'vitest'

import { parsePublicChatThreadId } from './threadResolver.js'

describe('public chat thread IDs', () => {
  it('parses group thread IDs', () => {
    expect(parsePublicChatThreadId('group:154')).toEqual({
      chatwootGroupContactId: 154,
      id: 'group:154',
      type: 'group',
    })
  })

  it('rejects retired company thread IDs', () => {
    expect(() => parsePublicChatThreadId('company:154')).toThrowError(
      expect.objectContaining({
        code: 'chat_thread_unsupported',
        statusCode: 400,
      }),
    )
  })
})
