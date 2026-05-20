import { describe, expect, it } from 'vitest'

import {
  buildCurrentSnapshotSearchResults,
  filterChatSearchResults,
  mergeChatSearchWithCurrentSnapshot,
} from './chatSearch'
import type {
  ChatMessagesSnapshot,
  ChatSearchResult,
  ChatThreadSearchResponse,
} from '../types'

const privateThread = {
  id: 'private:me',
  subtitle: 'Только вы и поддержка',
  title: 'Личный чат',
  type: 'private',
} as const

const snapshot: ChatMessagesSnapshot = {
  activeThread: privateThread,
  hasMoreOlder: false,
  messages: [
    {
      attachments: [],
      authorName: 'Вы',
      authorRole: 'current_user',
      content: 'Свежий договор из transcript snapshot',
      contentType: 'text',
      createdAt: '2026-05-20T08:15:00.000Z',
      direction: 'outgoing',
      id: 501,
      status: 'sent',
    },
    {
      attachments: [],
      authorName: 'Ольга Support',
      authorRole: 'agent',
      content: 'Ответ поддержки по договору',
      contentType: 'text',
      createdAt: '2026-05-20T08:20:00.000Z',
      direction: 'incoming',
      id: 502,
      status: 'sent',
    },
  ],
  nextOlderCursor: null,
  reason: 'none',
  result: 'ready',
}

const backendSearchResult: ChatSearchResult = {
  afterSnippet: null,
  authorName: 'Вы',
  authorRole: 'current_user',
  beforeSnippet: null,
  content: 'Свежий договор из transcript snapshot',
  createdAt: '2026-05-20T08:15:00.000Z',
  direction: 'outgoing',
  id: 'message:501',
  matchRanges: [{ start: 7, end: 14 }],
  messageId: 501,
}

const backendResponse: ChatThreadSearchResponse = {
  activeThread: privateThread,
  hasMoreOlder: false,
  items: [backendSearchResult],
  nextOlderCursor: null,
  query: 'договор',
  reason: 'none',
  result: 'ready',
}

describe('frontend chat search helpers', () => {
  it('builds search results from the current transcript snapshot', () => {
    expect(
      buildCurrentSnapshotSearchResults({
        currentSnapshot: snapshot,
        query: 'договор',
        selectedThreadId: 'private:me',
      }),
    ).toEqual([
      expect.objectContaining({ messageId: 502 }),
      expect.objectContaining({ messageId: 501 }),
    ])
  })

  it('builds current snapshot results when punctuation differs between content and query', () => {
    expect(
      buildCurrentSnapshotSearchResults({
        currentSnapshot: {
          ...snapshot,
          messages: [
            {
              ...snapshot.messages[0],
              content: 'ничего, всё по старому',
            },
          ],
        },
        query: 'ничего всё по старому',
        selectedThreadId: 'private:me',
      }),
    ).toEqual([
      expect.objectContaining({
        matchRanges: [{ start: 0, end: 22 }],
        messageId: 501,
      }),
    ])
  })

  it('deduplicates backend results by message id when merging snapshot results', () => {
    const merged = mergeChatSearchWithCurrentSnapshot({
      currentSnapshot: snapshot,
      search: backendResponse,
      selectedThreadId: 'private:me',
    })

    expect(merged.items.map((item) => item.messageId)).toEqual([502, 501])
  })

  it('filters support results as agent and group member messages', () => {
    const results: ChatSearchResult[] = [
      ...buildCurrentSnapshotSearchResults({
        currentSnapshot: snapshot,
        query: 'договор',
        selectedThreadId: 'private:me',
      }),
      {
        ...backendSearchResult,
        authorName: 'Иван Петров',
        authorRole: 'group_member',
        id: 'message:503',
        messageId: 503,
      },
    ]

    expect(filterChatSearchResults(results, 'mine')).toHaveLength(1)
    expect(filterChatSearchResults(results, 'support')).toHaveLength(2)
    expect(filterChatSearchResults(results, 'all')).toHaveLength(3)
  })
})
