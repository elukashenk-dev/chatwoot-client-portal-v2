import { useState } from 'react'
import type { ReactNode } from 'react'

import {
  FileTextIcon,
  ImageIcon,
  MicrophoneIcon,
} from '../../../shared/ui/icons'
import type {
  ChatMediaCategory,
  ChatMediaItem,
  ChatThreadMediaResponse,
} from '../types'
import { ChatFullScreenPanel } from './ChatFullScreenPanel'
import { formatAttachmentSize } from './chat-transcript/utils'

type ChatMediaPageProps = {
  isLoading: boolean
  isLoadingOlder?: boolean
  media: ChatThreadMediaResponse | null
  onBack: () => void
  onLoadOlder: () => void
  onRetry: () => void
}

type MediaFilter = ChatMediaCategory | 'all'

const mediaFilters: Array<{ key: MediaFilter; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'image', label: 'Фото' },
  { key: 'video', label: 'Видео' },
  { key: 'audio', label: 'Аудио' },
  { key: 'file', label: 'Файлы' },
]

const MEDIA_DATE_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  month: 'short',
})

function formatMediaDate(value: string) {
  return MEDIA_DATE_FORMATTER.format(new Date(value))
}

function formatFileType(value: string) {
  return value.trim().toUpperCase() || 'FILE'
}

function getItemMeta(item: ChatMediaItem) {
  return [
    formatFileType(item.fileType),
    formatAttachmentSize(item.fileSize),
    item.authorName,
    formatMediaDate(item.createdAt),
  ].join(' · ')
}

function MediaIcon({ category }: { category: ChatMediaCategory }) {
  if (category === 'image') {
    return <ImageIcon className="h-5 w-5" />
  }

  if (category === 'audio') {
    return <MicrophoneIcon className="h-5 w-5" />
  }

  return <FileTextIcon className="h-5 w-5" />
}

function ThreadIdentity({ media }: { media: ChatThreadMediaResponse }) {
  return (
    <div className="mb-4 min-w-0 border-b border-slate-200/80 pb-4">
      <h2 className="truncate text-[17px] font-semibold leading-tight text-slate-900">
        {media.activeThread?.title ?? 'Чат'}
      </h2>
      <p className="mt-1 truncate text-[13px] leading-5 text-slate-500">
        {media.activeThread?.subtitle ?? 'Медиа и файлы'}
      </p>
    </div>
  )
}

function FilterTabs({
  activeFilter,
  onChange,
}: {
  activeFilter: MediaFilter
  onChange: (filter: MediaFilter) => void
}) {
  return (
    <div
      aria-label="Фильтр медиа"
      className="mb-5 grid grid-cols-5 rounded-lg bg-slate-100 p-1"
      role="group"
    >
      {mediaFilters.map((filter) => {
        const isActive = filter.key === activeFilter

        return (
          <button
            aria-pressed={isActive}
            className={`min-h-10 rounded-md px-1.5 text-[12px] font-medium transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 ${
              isActive
                ? 'bg-white text-brand-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
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

function MediaLink({
  children,
  className,
  item,
}: {
  children: ReactNode
  className: string
  item: ChatMediaItem
}) {
  const normalizedUrl = item.url.trim()

  if (!normalizedUrl) {
    return (
      <div className={`${className} opacity-60`}>
        {children}
        <span className="mt-2 block text-[12px] font-medium text-slate-500">
          Файл недоступен
        </span>
      </div>
    )
  }

  return (
    <a
      className={className}
      href={normalizedUrl}
      rel="noreferrer"
      target="_blank"
    >
      {children}
    </a>
  )
}

function VisualMediaCard({ item }: { item: ChatMediaItem }) {
  return (
    <MediaLink
      className="block min-w-0 rounded-lg border border-slate-200/90 bg-white p-2 text-left transition hover:border-brand-200 hover:shadow-sm"
      item={item}
    >
      <span className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-slate-100 text-slate-500">
        {item.category === 'image' && item.thumbUrl ? (
          <img
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            src={item.thumbUrl}
          />
        ) : (
          <MediaIcon category={item.category} />
        )}
      </span>
      <span className="mt-2 block truncate text-[13px] font-medium leading-5 text-slate-900">
        {item.name}
      </span>
      <span className="block truncate text-[12px] leading-5 text-slate-500">
        {getItemMeta(item)}
      </span>
    </MediaLink>
  )
}

function FileMediaRow({ item }: { item: ChatMediaItem }) {
  return (
    <MediaLink
      className="flex min-h-14 min-w-0 items-center gap-3 border-b border-slate-200/80 bg-white px-3 py-2.5 text-left transition last:border-b-0 hover:bg-slate-50"
      item={item}
    >
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-brand-800">
        <MediaIcon category={item.category} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium leading-5 text-slate-900">
          {item.name}
        </span>
        <span className="block truncate text-[12px] leading-5 text-slate-500">
          {getItemMeta(item)}
        </span>
      </span>
    </MediaLink>
  )
}

function MediaSections({ items }: { items: ChatMediaItem[] }) {
  const visualItems = items.filter(
    (item) => item.category === 'image' || item.category === 'video',
  )
  const fileItems = items.filter(
    (item) => item.category === 'audio' || item.category === 'file',
  )

  return (
    <div className="space-y-5">
      {visualItems.length > 0 ? (
        <section aria-label="Фото и видео">
          <h2 className="px-1 text-[12px] font-semibold uppercase tracking-normal text-slate-500">
            Фото и видео
          </h2>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {visualItems.map((item) => (
              <VisualMediaCard item={item} key={item.id} />
            ))}
          </div>
        </section>
      ) : null}

      {fileItems.length > 0 ? (
        <section aria-label="Аудио и файлы">
          <h2 className="px-1 text-[12px] font-semibold uppercase tracking-normal text-slate-500">
            Аудио и файлы
          </h2>
          <div className="mt-2 overflow-hidden rounded-lg border border-slate-200/90 bg-white">
            {fileItems.map((item) => (
              <FileMediaRow item={item} key={item.id} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

export function ChatMediaPage({
  isLoading,
  isLoadingOlder = false,
  media,
  onBack,
  onLoadOlder,
  onRetry,
}: ChatMediaPageProps) {
  const [activeFilter, setActiveFilter] = useState<MediaFilter>('all')
  const isUnavailable = !media || media.result !== 'ready'
  const items =
    media?.items.filter((item) =>
      activeFilter === 'all' ? true : item.category === activeFilter,
    ) ?? []

  return (
    <ChatFullScreenPanel
      isLoading={isLoading}
      isUnavailable={isUnavailable}
      loadingMessage="Загружаем медиа и файлы."
      onBack={onBack}
      onRetry={onRetry}
      title="Медиа и файлы"
      unavailableMessage="Не удалось загрузить медиа и файлы."
    >
      {media ? (
        <div className="mx-auto max-w-md">
          <ThreadIdentity media={media} />
          <FilterTabs activeFilter={activeFilter} onChange={setActiveFilter} />

          {items.length > 0 ? (
            <MediaSections items={items} />
          ) : (
            <div className="mt-14 rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-[13px] leading-5 text-slate-500">
              В этом чате пока нет файлов
            </div>
          )}

          {media.hasMoreOlder ? (
            <button
              className="mt-5 flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-700 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoadingOlder}
              onClick={onLoadOlder}
              type="button"
            >
              {isLoadingOlder ? 'Загружаем...' : 'Показать ещё'}
            </button>
          ) : null}
        </div>
      ) : null}
    </ChatFullScreenPanel>
  )
}
