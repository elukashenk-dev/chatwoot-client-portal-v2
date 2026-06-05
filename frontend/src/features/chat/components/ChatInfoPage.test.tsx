import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type {
  ChatSupportAvailabilityResponse,
  ChatThreadInfoResponse,
} from '../types'
import { ChatInfoPage } from './ChatInfoPage'

const privateInfo = {
  accessLabel: 'Вы и поддержка',
  activeThread: {
    avatarUrl: '/api/tenant/icons/icon-192.png',
    id: 'private:me',
    subtitle: 'Вы и поддержка',
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

const supportAvailability = {
  currentStatus: 'outside_hours',
  outOfOfficeMessage: 'Ответим в рабочее время.',
  reason: 'none',
  result: 'ready',
  workingHours: {
    enabled: true,
    isWithinWorkingHours: false,
    rows: [
      {
        closeTime: '18:00',
        dayOfWeek: 1,
        isClosedAllDay: false,
        isOpenAllDay: false,
        openTime: '09:00',
      },
      {
        closeTime: '18:00',
        dayOfWeek: 2,
        isClosedAllDay: false,
        isOpenAllDay: false,
        openTime: '09:00',
      },
      {
        closeTime: null,
        dayOfWeek: 6,
        isClosedAllDay: true,
        isOpenAllDay: false,
        openTime: null,
      },
    ],
    timezone: 'Europe/Samara',
  },
} satisfies ChatSupportAvailabilityResponse

describe('ChatInfoPage', () => {
  it('renders private chat details without participants', () => {
    render(
      <ChatInfoPage
        info={privateInfo}
        isLoading={false}
        isSupportAvailabilityLoading={false}
        onBack={vi.fn()}
        onRetry={vi.fn()}
        supportAvailability={null}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Информация о чате' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Личный чат')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Личный чат' })).toHaveAttribute(
      'src',
      '/api/tenant/icons/icon-192.png',
    )
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
        isSupportAvailabilityLoading={false}
        onBack={vi.fn()}
        onRetry={vi.fn()}
        supportAvailability={null}
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
              avatarUrl: '/api/chat/threads/group%3A154/participants/7/avatar',
              displayName: 'Иван Петров',
              id: 'portal-user:7',
              isCurrentUser: true,
            },
            {
              avatarUrl: '/api/chat/threads/group%3A154/participants/8/avatar',
              displayName: 'Мария Соколова',
              id: 'portal-user:8',
              isCurrentUser: false,
            },
          ],
          threadTypeLabel: 'Групповой',
        }}
        isLoading={false}
        isSupportAvailabilityLoading={false}
        onBack={vi.fn()}
        onRetry={vi.fn()}
        supportAvailability={null}
      />,
    )

    expect(screen.getByText('Участники портала')).toBeInTheDocument()
    expect(screen.getByText('Иван Петров')).toBeInTheDocument()
    expect(screen.getByText('Вы')).toBeInTheDocument()
    expect(screen.getByText('Мария Соколова')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Иван Петров' })).toHaveAttribute(
      'src',
      '/api/chat/threads/group%3A154/participants/7/avatar',
    )
    expect(
      screen.getByRole('img', { name: 'Мария Соколова' }),
    ).toHaveAttribute(
      'src',
      '/api/chat/threads/group%3A154/participants/8/avatar',
    )
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
        isSupportAvailabilityLoading={false}
        onBack={vi.fn()}
        onRetry={onRetry}
        supportAvailability={null}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders working hours and out-of-office state', () => {
    render(
      <ChatInfoPage
        info={privateInfo}
        isLoading={false}
        isSupportAvailabilityLoading={false}
        onBack={vi.fn()}
        onRetry={vi.fn()}
        supportAvailability={supportAvailability}
      />,
    )

    expect(screen.getByText('Часы работы')).toBeInTheDocument()
    expect(screen.getByText('Вне графика')).toBeInTheDocument()
    expect(screen.getByText('Пн - Вт')).toBeInTheDocument()
    expect(screen.getByText('09:00 - 18:00')).toBeInTheDocument()
    expect(screen.getByText('Сб')).toBeInTheDocument()
    expect(screen.getByText('Выходной')).toBeInTheDocument()
    expect(screen.getByText('Часовой пояс: Europe/Samara')).toBeInTheDocument()
    expect(screen.getByText('Ответим в рабочее время.')).toBeInTheDocument()
  })

  it('renders working-hours loading state without a failure message', () => {
    render(
      <ChatInfoPage
        info={privateInfo}
        isLoading={false}
        isSupportAvailabilityLoading
        onBack={vi.fn()}
        onRetry={vi.fn()}
        supportAvailability={null}
      />,
    )

    expect(
      screen.getByText('Проверяем расписание поддержки.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Не удалось загрузить расписание поддержки.'),
    ).not.toBeInTheDocument()
  })

  it('renders disabled working-hours state', () => {
    render(
      <ChatInfoPage
        info={privateInfo}
        isLoading={false}
        isSupportAvailabilityLoading={false}
        onBack={vi.fn()}
        onRetry={vi.fn()}
        supportAvailability={{
          ...supportAvailability,
          currentStatus: 'offline',
          outOfOfficeMessage: null,
          workingHours: {
            enabled: false,
            isWithinWorkingHours: null,
            rows: [],
            timezone: 'UTC',
          },
        }}
      />,
    )

    expect(screen.getByText('Без расписания')).toBeInTheDocument()
    expect(
      screen.queryByText('Ответим в рабочее время.'),
    ).not.toBeInTheDocument()
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
        isSupportAvailabilityLoading={false}
        onBack={vi.fn()}
        onRetry={vi.fn()}
        supportAvailability={null}
      />,
    )

    expect(
      screen.getByText('Не удалось загрузить информацию о чате.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Тип чата')).not.toBeInTheDocument()
  })
})
