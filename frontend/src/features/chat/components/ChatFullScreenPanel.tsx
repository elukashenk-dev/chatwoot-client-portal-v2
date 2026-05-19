import type { ReactNode } from 'react'

import { ChevronLeftIcon, RefreshIcon } from '../../../shared/ui/icons'

type ChatFullScreenPanelProps = {
  children: ReactNode
  isLoading: boolean
  isUnavailable?: boolean
  loadingMessage?: string
  onBack: () => void
  onRetry: () => void
  title: string
  unavailableMessage?: string
}

export function ChatFullScreenPanel({
  children,
  isLoading,
  isUnavailable = false,
  loadingMessage = 'Загружаем данные.',
  onBack,
  onRetry,
  title,
  unavailableMessage = 'Не удалось загрузить данные.',
}: ChatFullScreenPanelProps) {
  return (
    <section className="fixed inset-0 z-40 flex min-h-0 flex-col bg-white text-slate-900">
      <header className="app-safe-top chat-header-background border-b border-slate-200/90 px-4 pb-2.5 shadow-sm sm:px-6 sm:pb-3">
        <div className="flex min-h-10 items-center gap-3">
          <button
            aria-label="Вернуться к чату"
            className="inline-flex h-10 w-10 items-center justify-center rounded-chat-control text-slate-600 transition hover:bg-slate-100/80 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
            onClick={onBack}
            type="button"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-[16px] font-semibold leading-tight">
            {title}
          </h1>
        </div>
      </header>

      <div className="chat-scroll min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        {isLoading ? (
          <div className="mx-auto mt-16 max-w-xs text-center text-sm text-slate-500">
            {loadingMessage}
          </div>
        ) : null}

        {!isLoading && isUnavailable ? (
          <div className="mx-auto mt-16 max-w-xs text-center">
            <p className="text-sm text-slate-600">{unavailableMessage}</p>
            <button
              className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-700 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
              onClick={onRetry}
              type="button"
            >
              <RefreshIcon className="h-4 w-4" />
              Повторить
            </button>
          </div>
        ) : null}

        {!isLoading && !isUnavailable ? children : null}
      </div>
    </section>
  )
}
