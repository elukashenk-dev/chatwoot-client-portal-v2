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
          avatarUrl: null,
          displayName: 'Мария Соколова',
          email: 'maria@example.test',
          isCurrentUser: false,
          userId: 8,
        },
        {
          avatarUrl: null,
          displayName: null,
          email: 'ivan@example.test',
          isCurrentUser: true,
          userId: 7,
        },
        {
          avatarUrl: null,
          displayName: 'Мария Соколова',
          email: 'maria@example.test',
          isCurrentUser: false,
          userId: 8,
        },
      ]),
    ).toEqual([
      {
        avatarUrl: null,
        displayName: 'ivan@example.test',
        id: 'portal-user:7',
        isCurrentUser: true,
      },
      {
        avatarUrl: null,
        displayName: 'Мария Соколова',
        id: 'portal-user:8',
        isCurrentUser: false,
      },
    ])
  })

  it('keeps portal-owned participant avatar URLs while deduping users', () => {
    const participants = normalizeChatInfoParticipantRows([
      {
        avatarUrl: '/api/chat/threads/group%3A154/participants/8/avatar',
        displayName: 'Мария Соколова',
        email: 'maria@example.test',
        isCurrentUser: false,
        userId: 8,
      },
      {
        avatarUrl: '/api/chat/threads/group%3A154/participants/8/avatar',
        displayName: 'Мария Соколова',
        email: 'maria@example.test',
        isCurrentUser: false,
        userId: 8,
      },
    ])

    expect(participants).toEqual([
      {
        avatarUrl: '/api/chat/threads/group%3A154/participants/8/avatar',
        displayName: 'Мария Соколова',
        id: 'portal-user:8',
        isCurrentUser: false,
      },
    ])
  })
})
