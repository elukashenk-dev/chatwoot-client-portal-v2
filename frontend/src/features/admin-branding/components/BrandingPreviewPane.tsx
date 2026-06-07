import type { CSSProperties } from 'react'

import type { BrandingDraft } from '../lib/brandingState'

type BrandingPreviewPaneProps = {
  draft: BrandingDraft
}

function imageBackgroundStyle(imageUrl?: string): CSSProperties | undefined {
  return imageUrl
    ? {
        backgroundImage: `url("${imageUrl}")`,
        backgroundPosition: 'center',
        backgroundSize: 'cover',
      }
    : undefined
}

export function BrandingPreviewPane({ draft }: BrandingPreviewPaneProps) {
  const { assets } = draft
  const authPreviewStyle = {
    backgroundColor: draft.colors.authBackground,
    ...imageBackgroundStyle(assets.auth_background_image?.publicUrl),
  }
  const chatHeaderStyle = {
    backgroundColor: draft.colors.chatHeaderBackground,
    ...imageBackgroundStyle(assets.chat_header_background_image?.publicUrl),
  }

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
        style={authPreviewStyle}
      >
        <div className="rounded-[0.6rem] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            {assets.logo ? (
              <img
                alt="Логотип портала"
                className="h-12 w-12 rounded-[0.55rem] object-cover ring-1 ring-slate-200"
                src={assets.logo.publicUrl}
              />
            ) : null}
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold text-slate-950">
                {draft.portalName}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {draft.supportLabel}
              </p>
            </div>
            {assets.pwa_icon ? (
              <img
                alt="PWA-иконка"
                className="ml-auto h-9 w-9 rounded-md object-cover ring-1 ring-slate-200"
                src={assets.pwa_icon.publicUrl}
              />
            ) : null}
          </div>
          {assets.auth_header_image ? (
            <img
              alt="Auth: верхнее изображение"
              className="mt-4 h-16 w-full rounded-[0.55rem] object-cover"
              src={assets.auth_header_image.publicUrl}
            />
          ) : null}
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
          {assets.auth_footer_image ? (
            <img
              alt="Auth: нижнее изображение"
              className="mt-4 h-12 w-full rounded-[0.55rem] object-cover"
              src={assets.auth_footer_image.publicUrl}
            />
          ) : null}
        </div>
      </div>

      <div
        className="overflow-hidden rounded-[0.75rem] border border-slate-200 bg-white shadow-sm"
        style={{ backgroundColor: draft.colors.chatBackground }}
      >
        <div className="px-4 py-3 text-white" style={chatHeaderStyle}>
          <p className="text-sm font-semibold">{draft.portalName}</p>
          <p className="mt-0.5 text-xs opacity-80">{draft.supportLabel}</p>
        </div>
        <div
          className="p-4"
          style={imageBackgroundStyle(assets.chat_background_image?.publicUrl)}
        >
          <div className="max-w-[14rem] rounded-[0.9rem] bg-white px-3 py-2 text-sm leading-5 text-slate-700 shadow-sm ring-1 ring-slate-200">
            {draft.copy.chatEmptyTitle}
          </div>
          <div className="mt-4 rounded-[0.6rem] border border-dashed border-slate-200 bg-white/80 px-3 py-2 text-xs leading-5 text-slate-500">
            Изображения показываются только в preview до применения в клиентский
            портал.
          </div>
        </div>
      </div>
    </div>
  )
}
