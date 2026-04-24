import { RefreshIcon } from '../shared/ui/icons'

import { useServiceWorkerUpdate } from './useServiceWorkerUpdate'

export function PwaUpdateBanner() {
  const { applyUpdate, status } = useServiceWorkerUpdate()

  if (status === 'idle' || status === 'unsupported') {
    return null
  }

  const isApplying = status === 'applying'

  return (
    <div className="app-safe-top pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4">
      <div className="pointer-events-auto flex w-full max-w-xl items-center justify-between gap-4 rounded-[1rem] border border-brand-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-lg shadow-slate-900/10">
        <div className="min-w-0">
          <div className="font-medium text-slate-900">
            {isApplying
              ? 'Применяем обновление приложения...'
              : 'Доступна новая версия приложения.'}
          </div>
          <div className="mt-0.5 text-slate-500">
            {isApplying
              ? 'Страница перезагрузится автоматически.'
              : 'Обновить можно в безопасный момент, без принудительного сброса во время работы.'}
          </div>
        </div>

        <button
          className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-[0.75rem] bg-brand-800 px-3.5 text-sm font-medium text-white transition hover:bg-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={isApplying}
          onClick={() => {
            applyUpdate()
          }}
          type="button"
        >
          <RefreshIcon
            className={isApplying ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
          />
          {isApplying ? 'Обновляем...' : 'Обновить'}
        </button>
      </div>
    </div>
  )
}
