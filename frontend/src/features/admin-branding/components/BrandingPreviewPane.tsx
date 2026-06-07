import type { BrandingDraft } from '../lib/brandingState'

type BrandingPreviewPaneProps = {
  draft: BrandingDraft
}

export function BrandingPreviewPane({ draft }: BrandingPreviewPaneProps) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-normal text-brand-700">
          Предпросмотр
        </p>
        <h2 className="mt-2 text-xl font-semibold">Копия портала</h2>
      </div>

      <div
        className="rounded-[0.75rem] border border-slate-200 p-4 shadow-sm"
        style={{ backgroundColor: draft.colors.authBackground }}
      >
        <div className="rounded-[0.6rem] bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-950">
            {draft.portalName}
          </h3>
          <p className="mt-1 text-sm text-slate-500">{draft.supportLabel}</p>
          <div className="mt-5 rounded-[0.6rem] border border-slate-200 p-3">
            <p className="text-sm font-semibold text-slate-900">
              {draft.copy.authTitle}
            </p>
            <p className="mt-1 text-sm leading-5 text-slate-500">
              {draft.copy.authSubtitle}
            </p>
            <button
              className="mt-4 h-10 w-full rounded-[0.55rem] text-sm font-semibold text-white"
              style={{ backgroundColor: draft.colors.primary }}
              type="button"
            >
              Продолжить
            </button>
          </div>
        </div>
      </div>

      <div
        className="overflow-hidden rounded-[0.75rem] border border-slate-200 bg-white shadow-sm"
        style={{ backgroundColor: draft.colors.chatBackground }}
      >
        <div
          className="px-4 py-3 text-white"
          style={{ backgroundColor: draft.colors.chatHeaderBackground }}
        >
          <p className="text-sm font-semibold">{draft.portalName}</p>
          <p className="mt-0.5 text-xs opacity-80">{draft.supportLabel}</p>
        </div>
        <div className="p-4">
          <div className="max-w-[14rem] rounded-[0.9rem] bg-white px-3 py-2 text-sm leading-5 text-slate-700 shadow-sm ring-1 ring-slate-200">
            {draft.copy.chatEmptyTitle}
          </div>
          <p className="mt-4 rounded-[0.6rem] border border-dashed border-slate-200 bg-white/80 px-3 py-2 text-xs leading-5 text-slate-500">
            Загрузка изображений появится в следующем срезе.
          </p>
        </div>
      </div>
    </div>
  )
}
