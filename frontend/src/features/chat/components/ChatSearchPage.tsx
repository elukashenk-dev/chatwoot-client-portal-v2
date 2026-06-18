import { useState, type ReactNode } from 'react'

import { filterChatSearchResults } from '../lib/chatSearch'
import type {
  ChatSearchAuthorFilter,
  ChatSearchMatchRange,
  ChatSearchResult,
  ChatThreadSearchResponse,
  ChatThreadSummary,
} from '../types'
import { SearchIcon } from '../../../shared/ui/icons'
import { ChatFullScreenPanel } from './ChatFullScreenPanel'

type ChatSearchPageProps = {
  activeThread: ChatThreadSummary | null
  isLoading: boolean
  isLoadingOlder?: boolean
  olderSearchErrorMessage?: string | null
  onBack: () => void
  onLoadOlder: () => void
  onQueryChange: (query: string) => void
  onRetry: () => void
  onResultSelect: (result: ChatSearchResult) => void
  query: string
  resultOpenErrorMessage?: string | null
  search: ChatThreadSearchResponse | null
}

const searchFilters: Array<{ key: ChatSearchAuthorFilter; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'mine', label: 'Мои' },
  { key: 'support', label: 'Поддержка' },
]

const GLASS_CARD_CLASS = 'chat-glass-card-surface'

const SEARCH_DATE_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  month: 'short',
})

function formatSearchDate(value: string) {
  return SEARCH_DATE_FORMATTER.format(new Date(value))
}

function renderHighlightedText(
  content: string,
  matchRanges: ChatSearchMatchRange[],
) {
  if (matchRanges.length === 0) {
    return content
  }

  const nodes: ReactNode[] = []
  let cursor = 0

  for (const range of matchRanges) {
    if (range.start > cursor) {
      nodes.push(content.slice(cursor, range.start))
    }

    nodes.push(
      <mark
        className="rounded bg-amber-100 px-0.5 text-slate-950"
        data-search-match
        key={`${range.start}:${range.end}`}
      >
        {content.slice(range.start, range.end)}
      </mark>,
    )
    cursor = range.end
  }

  if (cursor < content.length) {
    nodes.push(content.slice(cursor))
  }

  return nodes
}

function ThreadIdentity({
  activeThread,
}: {
  activeThread: ChatThreadSummary | null
}) {
  return (
    <div className="mb-4 min-w-0 border-b border-slate-200/80 pb-4">
      <h2 className="truncate text-[17px] font-semibold leading-tight text-slate-900">
        {activeThread?.title ?? 'Чат'}
      </h2>
      <p className="mt-1 truncate text-[13px] leading-5 text-slate-500">
        {activeThread?.subtitle ?? 'Поиск по чату'}
      </p>
    </div>
  )
}

function FilterTabs({
  activeFilter,
  onChange,
}: {
  activeFilter: ChatSearchAuthorFilter
  onChange: (filter: ChatSearchAuthorFilter) => void
}) {
  return (
    <div
      aria-label="Фильтр авторов"
      className="mb-4 grid grid-cols-3 rounded-lg border border-white/65 bg-white/45 p-1 shadow-sm shadow-slate-900/[0.04] backdrop-blur-md"
      role="group"
    >
      {searchFilters.map((filter) => {
        const isActive = filter.key === activeFilter

        return (
          <button
            aria-pressed={isActive}
            className={`min-h-10 rounded-md px-2 text-[12px] font-medium transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 ${
              isActive
                ? 'bg-white/80 text-brand-900 shadow-sm'
                : 'text-slate-500 hover:bg-white/45 hover:text-slate-800'
            }`}
            key={filter.key}
            onClick={() => {
              onChange(filter.key)
            }}
            type="button"
          >
            {filter.label}
          </button>
        )
      })}
    </div>
  )
}

function SearchInput({
  onQueryChange,
  query,
}: {
  onQueryChange: (query: string) => void
  query: string
}) {
  return (
    <label className="mb-4 block">
      <span className="sr-only">Поиск по чату</span>
      <span
        className={`flex min-h-12 items-center gap-3 rounded-lg border px-3 text-slate-500 focus-within:border-brand-200 focus-within:ring-4 focus-within:ring-brand-100 ${GLASS_CARD_CLASS}`}
      >
        <SearchIcon className="h-5 w-5 shrink-0" />
        <input
          aria-label="Поиск по чату"
          autoComplete="off"
          className="min-w-0 flex-1 border-0 bg-transparent px-0 py-3 text-[15px] leading-5 text-slate-900 placeholder:text-slate-400 focus:ring-0"
          maxLength={80}
          onChange={(event) => {
            onQueryChange(event.target.value)
          }}
          placeholder="Поиск по чату"
          type="search"
          value={query}
        />
      </span>
    </label>
  )
}

function SearchEmptyState({
  canLoadMore,
  isFiltered,
  query,
}: {
  canLoadMore: boolean
  isFiltered: boolean
  query: string
}) {
  const normalizedQuery = query.trim()
  const message =
    normalizedQuery.length === 0
      ? 'Введите запрос, чтобы найти сообщение'
      : normalizedQuery.length < 2
        ? 'Введите минимум 2 символа'
        : canLoadMore && isFiltered
          ? 'В загруженной части нет совпадений для выбранного фильтра. Можно продолжить поиск глубже.'
          : canLoadMore
            ? 'В загруженной части совпадений нет. Можно продолжить поиск глубже.'
            : 'По этому запросу ничего не найдено'

  return (
    <div
      className={`mt-14 rounded-lg border px-4 py-8 text-center text-[13px] leading-5 text-slate-500 ${GLASS_CARD_CLASS}`}
    >
      {message}
    </div>
  )
}

function SearchOlderError({ message }: { message: string | null }) {
  if (!message) {
    return null
  }

  return (
    <div
      className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[12px] leading-5 text-amber-800"
      role="alert"
    >
      {message}
    </div>
  )
}

function SearchLoadingState() {
  return (
    <div
      className={`mt-10 rounded-lg border px-4 py-6 text-center text-[13px] leading-5 text-slate-500 ${GLASS_CARD_CLASS}`}
    >
      Ищем сообщения.
    </div>
  )
}

function ContextSnippet({
  label,
  value,
}: {
  label: string
  value: string | null
}) {
  if (!value) {
    return null
  }

  return (
    <div className="rounded-md border border-white/50 bg-white/45 px-3 py-2 backdrop-blur-md">
      <div className="text-[11px] font-medium uppercase tracking-normal text-slate-400">
        {label}
      </div>
      <div className="mt-1 line-clamp-2 text-[12px] leading-5 text-slate-500">
        {value}
      </div>
    </div>
  )
}

function SearchResultCard({
  item,
  onSelect,
}: {
  item: ChatSearchResult
  onSelect: (result: ChatSearchResult) => void
}) {
  return (
    <article className={`rounded-lg border p-3 ${GLASS_CARD_CLASS}`}>
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[12px] font-semibold text-brand-800">
          {item.authorName.trim().slice(0, 2).toLocaleUpperCase('ru-RU')}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <h3 className="truncate text-[13px] font-semibold leading-5 text-slate-900">
              {item.authorName}
            </h3>
            <span className="shrink-0 text-[12px] leading-5 text-slate-400">
              {formatSearchDate(item.createdAt)}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-[14px] leading-6 text-slate-700">
            {renderHighlightedText(item.content, item.matchRanges)}
          </p>
        </div>
      </div>

      {item.beforeSnippet || item.afterSnippet ? (
        <div className="mt-3 grid gap-2">
          <ContextSnippet label="До" value={item.beforeSnippet} />
          <ContextSnippet label="После" value={item.afterSnippet} />
        </div>
      ) : null}

      <button
        className="mt-3 flex min-h-10 w-full items-center justify-center rounded-lg border border-white/65 bg-white/60 px-3 text-[13px] font-medium text-brand-800 shadow-sm shadow-slate-900/[0.04] backdrop-blur-md transition hover:border-white/80 hover:bg-white/80 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
        onClick={() => {
          onSelect(item)
        }}
        type="button"
      >
        Открыть место в чате
      </button>
    </article>
  )
}
export function ChatSearchPage({
  activeThread,
  isLoading,
  isLoadingOlder = false,
  olderSearchErrorMessage = null,
  onBack,
  onLoadOlder,
  onQueryChange,
  onRetry,
  onResultSelect,
  query,
  resultOpenErrorMessage = null,
  search,
}: ChatSearchPageProps) {
  const [activeFilter, setActiveFilter] =
    useState<ChatSearchAuthorFilter>('all')
  const isUnavailable = Boolean(search && search.result !== 'ready')
  const items = filterChatSearchResults(search?.items ?? [], activeFilter)
  const displayedThread = search?.activeThread ?? activeThread
  const canLoadMore = Boolean(search?.hasMoreOlder)

  return (
    <ChatFullScreenPanel
      isLoading={false}
      isUnavailable={!isLoading && isUnavailable}
      onBack={onBack}
      onRetry={onRetry}
      title="Поиск по чату"
      unavailableMessage="Не удалось выполнить поиск."
    >
      <div className="mx-auto max-w-md">
        <SearchInput onQueryChange={onQueryChange} query={query} />

        <ThreadIdentity activeThread={displayedThread} />

        {resultOpenErrorMessage ? (
          <div
            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-800"
            role="alert"
          >
            {resultOpenErrorMessage}
          </div>
        ) : null}

        <FilterTabs activeFilter={activeFilter} onChange={setActiveFilter} />

        {search?.result === 'ready' && query.trim().length >= 2 ? (
          <div className="mb-3 px-1 text-[12px] leading-5 text-slate-500">
            {items.length} совпадений
          </div>
        ) : null}

        {isLoading ? (
          <SearchLoadingState />
        ) : items.length > 0 ? (
          <div className="grid gap-3">
            {items.map((item) => (
              <SearchResultCard
                item={item}
                key={item.id}
                onSelect={onResultSelect}
              />
            ))}
          </div>
        ) : (
          <SearchEmptyState
            canLoadMore={canLoadMore}
            isFiltered={activeFilter !== 'all'}
            query={query}
          />
        )}

        <SearchOlderError message={olderSearchErrorMessage} />

        {canLoadMore ? (
          <button
            className={`mt-5 flex min-h-11 w-full items-center justify-center rounded-lg border px-4 text-[13px] font-medium text-slate-700 transition hover:bg-white/80 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60 ${GLASS_CARD_CLASS}`}
            disabled={isLoadingOlder}
            onClick={onLoadOlder}
            type="button"
          >
            {isLoadingOlder ? 'Загружаем...' : 'Показать ещё'}
          </button>
        ) : null}
      </div>
    </ChatFullScreenPanel>
  )
}
