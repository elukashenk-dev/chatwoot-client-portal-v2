import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ChatMessage, ChatThreadSummary } from '../types'
import { ChatTranscript } from './ChatTranscript'

function createMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    attachments: [],
    authorName: 'Вы',
    authorRole: 'current_user',
    content: 'Сообщение',
    contentType: 'text',
    createdAt: '2026-04-21T10:00:00',
    direction: 'outgoing',
    id: 1,
    status: 'sent',
    ...overrides,
  }
}

function renderTranscript(
  messages: ChatMessage[],
  activeThreadType: ChatThreadSummary['type'] | null = null,
) {
  return render(
    <ChatTranscript
      activeThreadType={activeThreadType}
      hasMoreOlder={false}
      historyErrorMessage={null}
      isConnectionAvailable
      isLoadingOlder={false}
      messages={messages}
      onLoadOlder={vi.fn()}
      onReplyToMessage={vi.fn()}
      onRetryTextMessage={vi.fn()}
    />,
  )
}

function getMessageHeader(container: HTMLElement, messageId: number) {
  const message = container.querySelector(`[data-message-id="${messageId}"]`)
  const header = message?.querySelector('[data-message-header]')

  return header instanceof HTMLElement ? header : null
}

describe('ChatTranscript support badge', () => {
  it('renders a support badge only on the first agent message in a group support block', () => {
    const { container } = renderTranscript(
      [
        createMessage({
          authorName: 'Анна Support',
          authorRole: 'agent',
          content: 'Проверила документы.',
          createdAt: '2026-04-21T10:00:00',
          direction: 'incoming',
          id: 1,
        }),
        createMessage({
          authorName: 'Анна Support',
          authorRole: 'agent',
          content: 'Счет-фактура нужна в том же треде.',
          createdAt: '2026-04-21T10:00:30',
          direction: 'incoming',
          id: 2,
        }),
        createMessage({
          authorName: 'Анна Support',
          authorRole: 'agent',
          content: 'После загрузки отмечу комплект как принятый.',
          createdAt: '2026-04-21T10:01:00',
          direction: 'incoming',
          id: 3,
        }),
      ],
      'group',
    )

    expect(getMessageHeader(container, 1)).toHaveTextContent('Анна Support')
    expect(getMessageHeader(container, 1)).toHaveTextContent('Поддержка')
    expect(getMessageHeader(container, 2)).toBeNull()
    expect(getMessageHeader(container, 3)).toBeNull()
    expect(screen.getAllByText('Поддержка')).toHaveLength(1)
  })

  it('renders a new support badge after a group member interrupts the support block', () => {
    const { container } = renderTranscript(
      [
        createMessage({
          authorName: 'Анна Support',
          authorRole: 'agent',
          content: 'Проверила документы.',
          direction: 'incoming',
          id: 1,
        }),
        createMessage({
          authorName: 'Иван Петров',
          authorRole: 'group_member',
          content: 'Сейчас добавлю счет-фактуру.',
          direction: 'incoming',
          id: 2,
        }),
        createMessage({
          authorName: 'Анна Support',
          authorRole: 'agent',
          content: 'Спасибо, вижу файл.',
          direction: 'incoming',
          id: 3,
        }),
      ],
      'group',
    )

    expect(getMessageHeader(container, 1)).toHaveTextContent('Поддержка')
    expect(getMessageHeader(container, 2)).not.toHaveTextContent('Поддержка')
    expect(getMessageHeader(container, 3)).toHaveTextContent('Поддержка')
    expect(screen.getAllByText('Поддержка')).toHaveLength(2)
  })

  it('separates support and group member blocks when display names match', () => {
    const { container } = renderTranscript(
      [
        createMessage({
          authorName: 'Анна Иванова',
          authorRole: 'agent',
          content: 'Проверила документы.',
          direction: 'incoming',
          id: 1,
        }),
        createMessage({
          authorName: 'Анна Иванова',
          authorRole: 'group_member',
          content: 'Это сообщение от участника с таким же именем.',
          direction: 'incoming',
          id: 2,
        }),
        createMessage({
          authorName: 'Анна Иванова',
          authorRole: 'agent',
          content: 'Спасибо, продолжаю проверку.',
          direction: 'incoming',
          id: 3,
        }),
      ],
      'group',
    )

    expect(getMessageHeader(container, 1)).toHaveTextContent('Поддержка')
    expect(getMessageHeader(container, 2)).toHaveTextContent('Анна Иванова')
    expect(getMessageHeader(container, 2)).not.toHaveTextContent('Поддержка')
    expect(getMessageHeader(container, 3)).toHaveTextContent('Поддержка')
    expect(screen.getAllByText('Поддержка')).toHaveLength(2)
  })

  it('does not render support badges for private agent messages or group members', () => {
    const privateTranscript = renderTranscript([
      createMessage({
        authorName: 'Ольга Support',
        authorRole: 'agent',
        content: 'Ответ агента в личном чате.',
        direction: 'incoming',
        id: 1,
      }),
    ])

    expect(privateTranscript.container).not.toHaveTextContent('Поддержка')
    privateTranscript.unmount()

    const groupTranscript = renderTranscript(
      [
        createMessage({
          authorName: 'Мария Соколова',
          authorRole: 'group_member',
          content: 'Сообщение участника группы.',
          direction: 'incoming',
          id: 2,
        }),
      ],
      'group',
    )

    expect(groupTranscript.container).not.toHaveTextContent('Поддержка')
  })
})
