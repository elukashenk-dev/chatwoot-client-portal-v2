import { useMemo, useState } from 'react'

import { BrandingContext } from '../../../branding/lib/brandingContext'
import { createBrandingCssProperties } from '../../../branding/lib/brandingCss'
import { TenantIdentityContext } from '../../../tenant/lib/tenantIdentityContext'
import type { BrandingDraft } from '../../lib/brandingState'
import {
  createPreviewPublicBranding,
  createPreviewTenantIdentity,
} from '../../lib/previewBranding'
import { AuthLoginPreview } from './AuthLoginPreview'

type PreviewScreen = 'auth' | 'chat' | 'info'

type PortalPreviewFrameProps = {
  draft: BrandingDraft
}

const previewScreens = [
  { id: 'auth', label: 'Вход' },
  { id: 'chat', label: 'Чат' },
  { id: 'info', label: 'Инфо' },
] satisfies Array<{ id: PreviewScreen; label: string }>

function PreviewPlaceholder({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-white px-6 text-center">
      <p className="text-sm font-semibold text-slate-500">{title}</p>
    </div>
  )
}

export function PortalPreviewFrame({ draft }: PortalPreviewFrameProps) {
  const [activeScreen, setActiveScreen] = useState<PreviewScreen>('auth')
  const branding = useMemo(() => createPreviewPublicBranding(draft), [draft])
  const brandingValue = useMemo(
    () => ({
      branding,
      errorMessage: null,
      status: 'ready' as const,
    }),
    [branding],
  )
  const tenantIdentity = useMemo(
    () => createPreviewTenantIdentity(draft),
    [draft],
  )
  const cssProperties = useMemo(
    () => createBrandingCssProperties(branding),
    [branding],
  )

  return (
    <div className="space-y-4">
      <div
        aria-label="Экраны предпросмотра портала"
        className="grid grid-cols-3 gap-2"
        role="tablist"
      >
        {previewScreens.map((screen) => (
          <button
            aria-selected={activeScreen === screen.id}
            className={[
              'min-h-9 rounded-[0.55rem] border px-2 text-[12px] font-semibold transition',
              activeScreen === screen.id
                ? 'border-brand-800 bg-brand-900 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:text-brand-900',
            ].join(' ')}
            key={screen.id}
            onClick={() => {
              setActiveScreen(screen.id)
            }}
            role="tab"
            type="button"
          >
            {screen.label}
          </button>
        ))}
      </div>

      <BrandingContext.Provider value={brandingValue}>
        <TenantIdentityContext.Provider value={tenantIdentity}>
          <div
            className="portal-branding-scope rounded-[1rem] border border-slate-200 bg-slate-100 p-3 shadow-sm"
            style={cssProperties}
          >
            <div
              aria-label="Телефонный предпросмотр портала"
              className="mx-auto h-[720px] w-full max-w-[375px] overflow-hidden rounded-[1rem] border border-slate-200 bg-white shadow-sm"
              role="region"
            >
              {activeScreen === 'auth' ? <AuthLoginPreview /> : null}
              {activeScreen === 'chat' ? (
                <PreviewPlaceholder title="Предпросмотр чата" />
              ) : null}
              {activeScreen === 'info' ? (
                <PreviewPlaceholder title="Предпросмотр информации" />
              ) : null}
            </div>
          </div>
        </TenantIdentityContext.Provider>
      </BrandingContext.Provider>
    </div>
  )
}
