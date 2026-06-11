import { ChevronUpIcon } from '../../../../shared/ui/icons'

export type HistoryFragmentControls = {
  errorMessage: string | null
  hasMoreEarlier: boolean
  hasMoreLater: boolean
  isLoadingEarlier: boolean
  isLoadingLater: boolean
  onLoadEarlier: () => void
  onLoadLater: () => void
  onReturnToLatest: () => void
}

export function HistoryFragmentTopControls({
  controls,
}: {
  controls: HistoryFragmentControls
}) {
  return (
    <div className="mb-3 grid gap-2 self-stretch">
      <div className="rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-[12px] leading-5 text-brand-900">
        <strong className="block text-[13px]">Показан фрагмент истории</strong>
        Найденное сообщение открыто в контексте переписки.
      </div>
      {controls.hasMoreEarlier ? (
        <button
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-700 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-wait disabled:text-slate-300"
          disabled={controls.isLoadingEarlier}
          onClick={controls.onLoadEarlier}
          type="button"
        >
          {controls.isLoadingEarlier ? 'Загружаем...' : 'Показать более ранние'}
        </button>
      ) : null}
      {controls.errorMessage ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[12px] leading-5 text-amber-800">
          {controls.errorMessage}
        </div>
      ) : null}
    </div>
  )
}

export function LoadOlderMessagesControls({
  hasMoreOlder,
  historyErrorMessage,
  isConnectionAvailable,
  isLoadingOlder,
  onLoadOlder,
}: {
  hasMoreOlder: boolean
  historyErrorMessage: string | null
  isConnectionAvailable: boolean
  isLoadingOlder: boolean
  onLoadOlder: () => void
}) {
  if (!hasMoreOlder) {
    return null
  }

  return (
    <div className="flex flex-col items-center gap-2 self-center">
      <button
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-600 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-wait disabled:text-slate-300"
        disabled={isLoadingOlder || !isConnectionAvailable}
        onClick={onLoadOlder}
        type="button"
      >
        <ChevronUpIcon className="h-[15px] w-[15px]" />
        {isLoadingOlder
          ? 'Загружаем...'
          : !isConnectionAvailable
            ? 'Нет сети'
            : 'Загрузить более ранние сообщения'}
      </button>
      {historyErrorMessage ? (
        <div className="max-w-[340px] rounded-[0.8rem] border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[12px] leading-5 text-amber-800">
          {historyErrorMessage}
        </div>
      ) : null}
    </div>
  )
}

export function HistoryFragmentBottomControls({
  controls,
}: {
  controls: HistoryFragmentControls
}) {
  return (
    <div className="mt-4 grid gap-2 self-stretch">
      {controls.hasMoreLater ? (
        <button
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-700 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-wait disabled:text-slate-300"
          disabled={controls.isLoadingLater}
          onClick={controls.onLoadLater}
          type="button"
        >
          {controls.isLoadingLater ? 'Загружаем...' : 'Показать более поздние'}
        </button>
      ) : null}
      <button
        className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-900 px-4 text-[13px] font-semibold text-white transition hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
        onClick={controls.onReturnToLatest}
        type="button"
      >
        К последним сообщениям
      </button>
    </div>
  )
}
