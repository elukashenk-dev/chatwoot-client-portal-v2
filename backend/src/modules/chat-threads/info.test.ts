import { describe, expect, it } from 'vitest'

import {
  buildChatThreadAccessLabel,
  buildChatThreadTypeLabel,
  normalizeChatInfoParticipantRows,
  readCuratorName,
  toIsoDateTime,
} from './info.js'

describe('chat thread info helpers', () => {
  it('reads a trimmed curator name only from string custom attributes', () => {
    expect(readCuratorName({ curator_name: ' Анна Маттина ' })).toBe(
      'Анна Маттина',
    )
    expect(readCuratorName({ curator_name: '' })).toBeNull()
    expect(readCuratorName({ curator_name: 42 })).toBeNull()
    expect(readCuratorName(null)).toBeNull()
  })

  it('maps thread labels without exposing implementation details', () => {
    expect(buildChatThreadTypeLabel('private')).toBe('Личный')
    expect(buildChatThreadTypeLabel('group')).toBe('Групповой')
    expect(buildChatThreadAccessLabel('private')).toBe('Вы и поддержка')
    expect(buildChatThreadAccessLabel('group')).toBe(
      'Участники группы и поддержка',
    )
  })

  it('normalizes unix timestamps to ISO strings and keeps absent dates null', () => {
    expect(toIsoDateTime(1779148800)).toBe('2026-05-19T00:00:00.000Z')
    expect(toIsoDateTime(null)).toBeNull()
  })

  it('deduplicates and sorts safe participant rows with current user first', () => {
    expect(
      normalizeChatInfoParticipantRows([
        {
          displayName: 'Мария Соколова',
          email: 'maria@example.test',
          isCurrentUser: false,
          userId: 8,
        },
        {
          displayName: null,
          email: 'ivan@example.test',
          isCurrentUser: true,
          userId: 7,
        },
        {
          displayName: 'Мария Соколова',
          email: 'maria@example.test',
          isCurrentUser: false,
          userId: 8,
        },
      ]),
    ).toEqual([
      {
        displayName: 'ivan@example.test',
        id: 'portal-user:7',
        isCurrentUser: true,
      },
      {
        displayName: 'Мария Соколова',
        id: 'portal-user:8',
        isCurrentUser: false,
      },
    ])
  })
})
