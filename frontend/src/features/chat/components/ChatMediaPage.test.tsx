import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { ChatThreadMediaResponse } from '../types'
import { ChatMediaPage } from './ChatMediaPage'

const mediaResponse = {
  activeThread: {
    id: 'group:154',
    subtitle: 'Групповой чат',
    title: 'Бухгалтерия',
    type: 'group',
  },
  hasMoreOlder: true,
  items: [
    {
      attachmentId: 91,
      authorName: 'Ольга Support',
      authorRole: 'agent',
      category: 'image',
      createdAt: '2026-05-19T10:20:00.000Z',
      direction: 'incoming',
      fileSize: 2048,
      fileType: 'image',
      id: 'attachment:501:91',
      messageId: 501,
      name: 'receipt.png',
      thumbUrl: '/api/chat/threads/group%3A154/attachments/501/91/thumb',
      url: '/api/chat/threads/group%3A154/attachments/501/91',
    },
    {
      attachmentId: 92,
      authorName: 'Вы',
      authorRole: 'current_user',
      category: 'video',
      createdAt: '2026-05-19T11:00:00.000Z',
      direction: 'outgoing',
      fileSize: 4096,
      fileType: 'video/mp4',
      id: 'attachment:502:92',
      messageId: 502,
      name: 'walkthrough.mp4',
      thumbUrl: '',
      url: '/api/chat/threads/group%3A154/attachments/502/92',
    },
    {
      attachmentId: 93,
      authorName: 'Ольга Support',
      authorRole: 'agent',
      category: 'audio',
      createdAt: '2026-05-19T11:10:00.000Z',
      direction: 'incoming',
      fileSize: null,
      fileType: 'audio',
      id: 'attachment:503:93',
      messageId: 503,
      name: 'voice-message.webm',
      thumbUrl: '',
      url: '/api/chat/threads/group%3A154/attachments/503/93',
    },
    {
      attachmentId: 94,
      authorName: 'Вы',
      authorRole: 'current_user',
      category: 'file',
      createdAt: '2026-05-19T11:20:00.000Z',
      direction: 'outgoing',
      fileSize: 12_288,
      fileType: 'application/pdf',
      id: 'attachment:504:94',
      messageId: 504,
      name: 'contract.pdf',
      thumbUrl: '',
      url: '/api/chat/threads/group%3A154/attachments/504/94',
    },
  ],
  nextOlderCursor: 401,
  reason: 'none',
  result: 'ready',
} satisfies ChatThreadMediaResponse

describe('ChatMediaPage', () => {
  it('renders mixed media and file sections with thread identity', () => {
    render(
      <ChatMediaPage
        isLoading={false}
        media={mediaResponse}
        onBack={vi.fn()}
        onLoadOlder={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Медиа и файлы' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Бухгалтерия')).toBeInTheDocument()
    expect(screen.getByText('Групповой чат')).toBeInTheDocument()

    const visualSection = screen.getByRole('region', { name: 'Фото и видео' })
    expect(within(visualSection).getByText('receipt.png')).toBeInTheDocument()
    expect(
      within(visualSection).getByText('walkthrough.mp4'),
    ).toBeInTheDocument()

    const fileSection = screen.getByRole('region', { name: 'Аудио и файлы' })
    expect(
      within(fileSection).getByText('voice-message.webm'),
    ).toBeInTheDocument()
    expect(within(fileSection).getByText('contract.pdf')).toBeInTheDocument()
    expect(screen.getByText(/12 КБ/)).toBeInTheDocument()
  })

  it('filters visible items while preserving mixed layout', async () => {
    const user = userEvent.setup()

    render(
      <ChatMediaPage
        isLoading={false}
        media={mediaResponse}
        onBack={vi.fn()}
        onLoadOlder={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Фото' }))
    expect(screen.getByText('receipt.png')).toBeInTheDocument()
    expect(screen.queryByText('walkthrough.mp4')).not.toBeInTheDocument()
    expect(screen.queryByText('contract.pdf')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Файлы' }))
    expect(screen.getByText('contract.pdf')).toBeInTheDocument()
    expect(screen.queryByText('receipt.png')).not.toBeInTheDocument()
  })

  it('renders empty state and load more action', async () => {
    const user = userEvent.setup()
    const onLoadOlder = vi.fn()

    render(
      <ChatMediaPage
        isLoading={false}
        media={{
          ...mediaResponse,
          items: [],
        }}
        onBack={vi.fn()}
        onLoadOlder={onLoadOlder}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText('В этом чате пока нет файлов')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Показать ещё' }))
    expect(onLoadOlder).toHaveBeenCalledTimes(1)
  })

  it('calls retry from unavailable state', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()

    render(
      <ChatMediaPage
        isLoading={false}
        media={{
          ...mediaResponse,
          result: 'unavailable',
        }}
        onBack={vi.fn()}
        onLoadOlder={vi.fn()}
        onRetry={onRetry}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
