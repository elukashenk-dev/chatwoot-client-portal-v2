import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ChatMessage } from '../types'
import { useChatNotificationSound } from './useChatNotificationSound'

function message(
  id: number,
  overrides: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    attachments: [],
    authorName: 'Support',
    authorRole: 'agent',
    content: `Message ${id}`,
    contentType: 'text',
    createdAt: '2026-05-23T00:00:00.000Z',
    direction: 'incoming',
    id,
    status: 'sent',
    ...overrides,
  }
}

describe('useChatNotificationSound', () => {
  it('does not play on the initial message list', () => {
    const playSound = vi.fn()

    renderHook(() =>
      useChatNotificationSound({
        activeThreadId: 'private:me',
        enabled: true,
        messages: [message(1)],
        playSound,
      }),
    )

    expect(playSound).not.toHaveBeenCalled()
  })

  it('plays once for a later incoming message', () => {
    const playSound = vi.fn()
    const { rerender } = renderHook(
      ({ messages }) =>
        useChatNotificationSound({
          activeThreadId: 'private:me',
          enabled: true,
          messages,
          playSound,
        }),
      {
        initialProps: {
          messages: [message(1)],
        },
      },
    )

    rerender({ messages: [message(1), message(2)] })
    rerender({ messages: [message(1), message(2)] })

    expect(playSound).toHaveBeenCalledTimes(1)
  })

  it('does not play for own messages or when disabled', () => {
    const playSound = vi.fn()
    const { rerender } = renderHook(
      ({ enabled, messages }) =>
        useChatNotificationSound({
          activeThreadId: 'private:me',
          enabled,
          messages,
          playSound,
        }),
      {
        initialProps: {
          enabled: true,
          messages: [message(1)],
        },
      },
    )

    rerender({
      enabled: true,
      messages: [
        message(1),
        message(2, {
          authorRole: 'current_user',
          direction: 'outgoing',
        }),
      ],
    })
    rerender({
      enabled: false,
      messages: [message(1), message(2), message(3)],
    })

    expect(playSound).not.toHaveBeenCalled()
  })

  it('switching thread resets the baseline without playing old messages', () => {
    const playSound = vi.fn()
    const { rerender } = renderHook(
      ({ activeThreadId, messages }) =>
        useChatNotificationSound({
          activeThreadId,
          enabled: true,
          messages,
          playSound,
        }),
      {
        initialProps: {
          activeThreadId: 'private:me',
          messages: [message(1)],
        },
      },
    )

    rerender({
      activeThreadId: 'group:155',
      messages: [message(10)],
    })
    rerender({
      activeThreadId: 'group:155',
      messages: [message(10), message(11)],
    })

    expect(playSound).toHaveBeenCalledTimes(1)
  })
})
