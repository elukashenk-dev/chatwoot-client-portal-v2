import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { ChatThreadSearchResponse, ChatThreadSummary } from '../types'
import { ChatSearchPage } from './ChatSearchPage'

const groupThread = {
  id: 'group:154',
  subtitle: 'Групповой чат',
  title: 'ИП Петров',
  type: 'group',
} satisfies ChatThreadSummary

const readySearch: ChatThreadSearchResponse = {
  activeThread: {
    id: 'private:me',
    subtitle: 'Вы и поддержка',
    title: 'Личный чат',
    type: 'private',
  },
  hasMoreOlder: true,
  items: [
    {
      afterSnippet: 'Спасибо, проверю сегодня.',
      authorName: 'Ольга Support',
      authorRole: 'agent',
      beforeSnippet: 'Добрый день.',
      content: 'Договор готов к подписанию.',
      createdAt: '2026-05-20T08:20:00.000Z',
      direction: 'incoming',
      id: 'message:204',
      matchRanges: [{ start: 0, end: 7 }],
      messageId: 204,
    },
  ],
  nextOlderCursor: 204,
  query: 'договор',
  reason: 'none',
  result: 'ready',
}

function findParagraphByText(text: string) {
  return screen.queryByText((_, element) => {
    return (
      element?.tagName.toLowerCase() === 'p' && element.textContent === text
    )
  })
}

describe('ChatSearchPage', () => {
  it('keeps the thread title visible before results, while loading, and for empty results', () => {
    const props = {
      activeThread: groupThread,
      isLoading: false,
      isLoadingOlder: false,
      onBack: vi.fn(),
      onLoadOlder: vi.fn(),
      onQueryChange: vi.fn(),
      onRetry: vi.fn(),
      onResultSelect: vi.fn(),
      query: '',
      search: null,
    }

    const { rerender } = render(<ChatSearchPage {...props} />)
    expect(screen.getByText('ИП Петров')).toBeVisible()
    expect(screen.getByText('Групповой чат')).toBeVisible()

    rerender(<ChatSearchPage {...props} isLoading query="те" />)
    expect(screen.getByText('ИП Петров')).toBeVisible()
    expect(screen.getByText('Групповой чат')).toBeVisible()

    rerender(
      <ChatSearchPage
        {...props}
        query="нет"
        search={{
          ...readySearch,
          activeThread: groupThread,
          hasMoreOlder: false,
          items: [],
          query: 'нет',
        }}
      />,
    )
    expect(screen.getByText('ИП Петров')).toBeVisible()
    expect(screen.getByText('Групповой чат')).toBeVisible()
  })

  it('renders search input, highlighted result, context, and load more', async () => {
    const user = userEvent.setup()
    const onLoadOlder = vi.fn()
    const onQueryChange = vi.fn()
    const onResultSelect = vi.fn()

    render(
      <ChatSearchPage
        activeThread={readySearch.activeThread}
        isLoading={false}
        isLoadingOlder={false}
        onBack={vi.fn()}
        onLoadOlder={onLoadOlder}
        onQueryChange={onQueryChange}
        onRetry={vi.fn()}
        onResultSelect={onResultSelect}
        query="договор"
        search={readySearch}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Поиск по чату' })).toBeVisible()
    expect(screen.getByLabelText('Поиск по чату')).toHaveValue('договор')
    expect(screen.getByLabelText('Поиск по чату').parentElement).toHaveClass(
      'chat-glass-card-surface',
    )
    expect(screen.getByLabelText('Поиск по чату').parentElement).not.toHaveClass(
      'bg-white/70',
    )
    expect(screen.getByText('Личный чат')).toBeVisible()
    expect(screen.getByText('Добрый день.')).toBeVisible()
    expect(screen.getByText('Спасибо, проверю сегодня.')).toBeVisible()
    expect(screen.getByText('Договор')).toHaveAttribute('data-search-match')
    expect(
      findParagraphByText('Договор готов к подписанию.')?.closest('article'),
    ).toHaveClass('chat-glass-card-surface')
    expect(screen.getByRole('button', { name: /Открыть место/ })).toHaveClass(
      'border-white/65',
      'bg-white/60',
      'backdrop-blur-md',
    )

    await user.click(screen.getByRole('button', { name: 'Показать ещё' }))
    expect(onLoadOlder).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: /Открыть место/ }))
    expect(onResultSelect).toHaveBeenCalledWith(readySearch.items[0])
  })

  it('shows initial, short-query, and empty states', () => {
    const props = {
      activeThread: readySearch.activeThread,
      isLoading: false,
      isLoadingOlder: false,
      onBack: vi.fn(),
      onLoadOlder: vi.fn(),
      onQueryChange: vi.fn(),
      onRetry: vi.fn(),
      onResultSelect: vi.fn(),
      search: null,
    }

    const { rerender } = render(<ChatSearchPage {...props} query="" />)
    expect(
      screen.getByText('Введите запрос, чтобы найти сообщение'),
    ).toBeVisible()
    expect(
      screen.getByText('Введите запрос, чтобы найти сообщение'),
    ).toHaveClass('chat-glass-card-surface')
    expect(
      screen.getByText('Введите запрос, чтобы найти сообщение'),
    ).not.toHaveClass('bg-white/70')

    rerender(<ChatSearchPage {...props} query="д" />)
    expect(screen.getByText('Введите минимум 2 символа')).toBeVisible()

    rerender(
      <ChatSearchPage
        {...props}
        query="нет"
        search={{
          ...readySearch,
          hasMoreOlder: false,
          items: [],
          query: 'нет',
        }}
      />,
    )
    expect(screen.getByText('По этому запросу ничего не найдено')).toBeVisible()
  })

  it('shows a partial empty state while older history can still be searched', async () => {
    const user = userEvent.setup()

    const { rerender } = render(
      <ChatSearchPage
        activeThread={readySearch.activeThread}
        isLoading={false}
        isLoadingOlder={false}
        onBack={vi.fn()}
        onLoadOlder={vi.fn()}
        onQueryChange={vi.fn()}
        onRetry={vi.fn()}
        onResultSelect={vi.fn()}
        query="договор"
        search={{
          ...readySearch,
          hasMoreOlder: true,
          items: [],
          nextOlderCursor: 190,
        }}
      />,
    )

    expect(
      screen.getByText(
        'В загруженной части совпадений нет. Можно продолжить поиск глубже.',
      ),
    ).toBeVisible()
    expect(
      screen.getByText(
        'В загруженной части совпадений нет. Можно продолжить поиск глубже.',
      ),
    ).not.toHaveClass('border-dashed')
    expect(screen.queryByText('По этому запросу ничего не найдено')).toBeNull()

    rerender(
      <ChatSearchPage
        activeThread={readySearch.activeThread}
        isLoading={false}
        isLoadingOlder={false}
        onBack={vi.fn()}
        onLoadOlder={vi.fn()}
        onQueryChange={vi.fn()}
        onRetry={vi.fn()}
        onResultSelect={vi.fn()}
        query="договор"
        search={{
          ...readySearch,
          hasMoreOlder: true,
          items: [readySearch.items[0]],
          nextOlderCursor: 190,
        }}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Мои' }))
    expect(
      screen.getByText(
        'В загруженной части нет совпадений для выбранного фильтра. Можно продолжить поиск глубже.',
      ),
    ).toBeVisible()
  })

  it('shows an older search error without hiding current results', () => {
    render(
      <ChatSearchPage
        activeThread={readySearch.activeThread}
        isLoading={false}
        isLoadingOlder={false}
        olderSearchErrorMessage="Не удалось загрузить более ранние результаты. Попробуйте еще раз."
        onBack={vi.fn()}
        onLoadOlder={vi.fn()}
        onQueryChange={vi.fn()}
        onRetry={vi.fn()}
        onResultSelect={vi.fn()}
        query="договор"
        search={readySearch}
      />,
    )

    expect(findParagraphByText('Договор готов к подписанию.')).toBeVisible()
    expect(
      screen.getByText(
        'Не удалось загрузить более ранние результаты. Попробуйте еще раз.',
      ),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Показать ещё' })).toBeEnabled()
  })

  it('filters by author group on the page only', async () => {
    const user = userEvent.setup()

    render(
      <ChatSearchPage
        activeThread={readySearch.activeThread}
        isLoading={false}
        isLoadingOlder={false}
        onBack={vi.fn()}
        onLoadOlder={vi.fn()}
        onQueryChange={vi.fn()}
        onRetry={vi.fn()}
        onResultSelect={vi.fn()}
        query="договор"
        search={{
          ...readySearch,
          items: [
            readySearch.items[0],
            {
              ...readySearch.items[0],
              authorName: 'Вы',
              authorRole: 'current_user',
              content: 'Мой договор подписан.',
              direction: 'outgoing',
              id: 'message:205',
              matchRanges: [{ start: 4, end: 11 }],
              messageId: 205,
            },
          ],
        }}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Мои' }))
    expect(findParagraphByText('Мой договор подписан.')).toBeVisible()
    expect(findParagraphByText('Договор готов к подписанию.')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Поддержка' }))
    expect(findParagraphByText('Договор готов к подписанию.')).toBeVisible()
    expect(findParagraphByText('Мой договор подписан.')).toBeNull()
  })

  it('keeps the search input focused while a query is loading', () => {
    const props = {
      activeThread: readySearch.activeThread,
      isLoadingOlder: false,
      onBack: vi.fn(),
      onLoadOlder: vi.fn(),
      onQueryChange: vi.fn(),
      onRetry: vi.fn(),
      onResultSelect: vi.fn(),
      search: null,
    }

    const { rerender } = render(
      <ChatSearchPage {...props} isLoading={false} query="" />,
    )
    const input = screen.getByLabelText('Поиск по чату')

    input.focus()
    expect(input).toHaveFocus()

    rerender(<ChatSearchPage {...props} isLoading query="до" />)

    expect(screen.getByLabelText('Поиск по чату')).toHaveFocus()
    expect(screen.getByLabelText('Поиск по чату')).toHaveValue('до')
    expect(screen.getByText('Ищем сообщения.')).toBeVisible()
  })
})
