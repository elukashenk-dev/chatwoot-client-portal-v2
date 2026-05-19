import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { ChatThreadInfoResponse } from '../types'
import { ChatInfoPage } from './ChatInfoPage'

const privateInfo = {
  accessLabel: 'Только вы и поддержка',
  activeThread: {
    id: 'private:me',
    subtitle: 'Только вы и поддержка',
    title: 'Личный чат',
    type: 'private',
  },
  curatorName: 'Анна Маттина',
  lastActivityAt: '2026-05-19T10:20:00.000Z',
  participants: [],
  reason: 'none',
  result: 'ready',
  startedAt: '2026-05-18T09:00:00.000Z',
  supportLabel: 'Команда ProvGroup',
  threadTypeLabel: 'Личный',
} satisfies ChatThreadInfoResponse

describe('ChatInfoPage', () => {
  it('renders private chat details without participants', () => {
    render(
      <ChatInfoPage
        info={privateInfo}
        isLoading={false}
        onBack={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Информация о чате' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Личный чат')).toBeInTheDocument()
    expect(screen.getByText('Тип чата')).toBeInTheDocument()
    expect(screen.getByText('Личный')).toBeInTheDocument()
    expect(screen.getByText('Ваш куратор')).toBeInTheDocument()
    expect(screen.getByText('Анна Маттина')).toBeInTheDocument()
    expect(screen.queryByText('Участники портала')).not.toBeInTheDocument()
  })

  it('hides absent optional rows and renders empty conversation state', () => {
    render(
      <ChatInfoPage
        info={{
          ...privateInfo,
          curatorName: null,
          lastActivityAt: null,
          startedAt: null,
        }}
        isLoading={false}
        onBack={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.queryByText('Ваш куратор')).not.toBeInTheDocument()
    expect(screen.queryByText('Последняя активность')).not.toBeInTheDocument()
    expect(screen.getByText('Еще нет сообщений')).toBeInTheDocument()
  })

  it('renders group participants with current user marker', () => {
    render(
      <ChatInfoPage
        info={{
          ...privateInfo,
          activeThread: {
            id: 'group:154',
            subtitle: 'Групповой чат',
            title: 'ООО "Ромашка"',
            type: 'group',
          },
          accessLabel: 'Участники группы и поддержка',
          participants: [
            {
              displayName: 'Иван Петров',
              id: 'portal-user:7',
              isCurrentUser: true,
            },
            {
              displayName: 'Мария Соколова',
              id: 'portal-user:8',
              isCurrentUser: false,
            },
          ],
          threadTypeLabel: 'Групповой',
        }}
        isLoading={false}
        onBack={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText('Участники портала')).toBeInTheDocument()
    expect(screen.getByText('Иван Петров')).toBeInTheDocument()
    expect(screen.getByText('Вы')).toBeInTheDocument()
    expect(screen.getByText('Мария Соколова')).toBeInTheDocument()
  })

  it('calls retry from unavailable state', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()

    render(
      <ChatInfoPage
        info={{
          ...privateInfo,
          activeThread: null,
          result: 'unavailable',
        }}
        isLoading={false}
        onBack={vi.fn()}
        onRetry={onRetry}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('does not render empty details for a not-ready response', () => {
    render(
      <ChatInfoPage
        info={{
          accessLabel: '',
          activeThread: null,
          curatorName: null,
          lastActivityAt: null,
          participants: [],
          reason: 'thread_access_denied',
          result: 'not_ready',
          startedAt: null,
          supportLabel: 'Команда поддержки',
          threadTypeLabel: null,
        }}
        isLoading={false}
        onBack={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(
      screen.getByText('Не удалось загрузить информацию о чате.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Тип чата')).not.toBeInTheDocument()
  })
})
