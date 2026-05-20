import { describe, expect, it } from 'vitest'

import {
  buildPortalChatSearchResults,
  findSearchMatchRanges,
  normalizeChatSearchQuery,
} from './search.js'
import type { PortalChatMessage } from './types.js'

function createMessage(
  overrides: Partial<PortalChatMessage> = {},
): PortalChatMessage {
  return {
    attachments: [],
    authorName: 'Ольга Support',
    authorRole: 'agent',
    content: 'Здравствуйте, вижу ваше обращение.',
    contentType: 'text',
    createdAt: '2026-05-20T08:10:00.000Z',
    direction: 'incoming',
    id: 204,
    replyTo: null,
    status: 'sent',
    ...overrides,
  }
}

describe('chat search helpers', () => {
  it('normalizes query by trimming and capping length', () => {
    expect(normalizeChatSearchQuery('  обращение  ')).toBe('обращение')
    expect(normalizeChatSearchQuery('x'.repeat(90))).toHaveLength(80)
  })

  it('finds case-insensitive match ranges in original content coordinates', () => {
    expect(findSearchMatchRanges('Ваше Обращение принято', 'обращ')).toEqual([
      { start: 5, end: 10 },
    ])
  })

  it('matches phrases when punctuation differs between content and query', () => {
    expect(
      findSearchMatchRanges('ничего, всё по старому', 'ничего всё по старому'),
    ).toEqual([{ start: 0, end: 22 }])
  })

  it('maps visible text messages to search results with context snippets', () => {
    const results = buildPortalChatSearchResults({
      messages: [
        createMessage({
          content: 'Предыдущий вопрос по договору',
          id: 203,
        }),
        createMessage({
          content: 'Здравствуйте, договор готов к подписанию.',
          id: 204,
        }),
        createMessage({
          authorName: 'Вы',
          authorRole: 'current_user',
          content: 'Спасибо, посмотрю договор сегодня.',
          direction: 'outgoing',
          id: 205,
        }),
      ],
      query: 'договор',
    })

    expect(results).toEqual([
      expect.objectContaining({
        afterSnippet: null,
        authorName: 'Вы',
        authorRole: 'current_user',
        beforeSnippet: 'Здравствуйте, договор готов к подписанию.',
        content: 'Спасибо, посмотрю договор сегодня.',
        id: 'message:205',
        matchRanges: [{ start: 18, end: 25 }],
        messageId: 205,
      }),
      expect.objectContaining({
        afterSnippet: 'Спасибо, посмотрю договор сегодня.',
        authorName: 'Ольга Support',
        beforeSnippet: 'Предыдущий вопрос по договору',
        content: 'Здравствуйте, договор готов к подписанию.',
        id: 'message:204',
        matchRanges: [{ start: 14, end: 21 }],
        messageId: 204,
      }),
      expect.objectContaining({
        afterSnippet: 'Здравствуйте, договор готов к подписанию.',
        beforeSnippet: null,
        content: 'Предыдущий вопрос по договору',
        id: 'message:203',
        matchRanges: [{ start: 21, end: 28 }],
        messageId: 203,
      }),
    ])
  })

  it('ignores messages without text content', () => {
    expect(
      buildPortalChatSearchResults({
        messages: [createMessage({ content: null })],
        query: 'договор',
      }),
    ).toEqual([])
  })
})
