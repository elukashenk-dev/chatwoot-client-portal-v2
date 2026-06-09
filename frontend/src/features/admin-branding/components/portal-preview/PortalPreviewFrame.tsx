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
import { ChatConversationPreview } from './ChatConversationPreview'
import { ChatInfoPreview } from './ChatInfoPreview'

type PreviewScreen = 'auth' | 'chat' | 'info'

type PortalPreviewFrameProps = {
  draft: BrandingDraft
}

const previewScreens = [
  { id: 'auth', label: 'Вход' },
  { id: 'chat', label: 'Чат' },
  { id: 'info', label: 'Инфо' },
] satisfies Array<{ id: PreviewScreen; label: string }>

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
            className="portal-branding-scope portal-preview-stage rounded-[1.4rem] border border-slate-200 p-3 shadow-sm"
            style={cssProperties}
          >
            <div className="portal-preview-device" data-portal-preview-device>
              <div
                aria-hidden="true"
                className="portal-preview-device-hardware"
              >
                <span data-portal-preview-device-camera />
                <span data-portal-preview-device-speaker />
              </div>

              <div
                aria-label="Телефонный предпросмотр портала"
                className="portal-preview-device-screen portal-preview-no-scrollbar"
                role="region"
              >
                <div
                  aria-hidden="true"
                  className="portal-preview-device-status-bar"
                  data-portal-preview-device-status-bar
                >
                  <span data-portal-preview-device-time>12:59</span>
                  <span className="portal-preview-device-status-icons">
                    <span data-portal-preview-device-network />
                    <span data-portal-preview-device-wifi />
                    <span data-portal-preview-device-battery />
                  </span>
                </div>

                <div className="portal-preview-device-content">
                  {activeScreen === 'auth' ? <AuthLoginPreview /> : null}
                  {activeScreen === 'chat' ? <ChatConversationPreview /> : null}
                  {activeScreen === 'info' ? <ChatInfoPreview /> : null}
                </div>
              </div>

              <div
                aria-hidden="true"
                className="portal-preview-device-navigation"
                data-portal-preview-device-navigation
              >
                <span
                  className="portal-preview-device-nav-recents"
                  data-portal-preview-device-nav-control
                />
                <span
                  className="portal-preview-device-nav-home"
                  data-portal-preview-device-nav-control
                />
                <span
                  className="portal-preview-device-nav-back"
                  data-portal-preview-device-nav-control
                />
              </div>
            </div>
          </div>
        </TenantIdentityContext.Provider>
      </BrandingContext.Provider>
    </div>
  )
}
