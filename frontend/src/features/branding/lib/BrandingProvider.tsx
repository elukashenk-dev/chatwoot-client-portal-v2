import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'

import {
  getPublicBranding,
  type PublicBranding,
} from '../api/publicBrandingClient'
import type { BrandingContextValue } from './brandingContext'
import { BrandingContext } from './brandingContext'
import { createBrandingCssProperties } from './brandingCss'
import { createDefaultPublicBranding } from './brandingDefaults'
import { useTenantIdentity } from '../../tenant/lib/useTenantIdentity'

type BrandingProviderProps = {
  children: ReactNode
  loadWithoutTenant?: boolean
}

type RemoteBrandingState = {
  branding: PublicBranding | null
  errorMessage: string | null
  status: BrandingContextValue['status']
  tenantSlug: string | null
}

function setMetaContent(name: string, content: string) {
  document
    .querySelector(`meta[name="${name}"]`)
    ?.setAttribute('content', content)
}

function applyBrandingDocumentMetadata(
  branding: BrandingContextValue['branding'],
) {
  const appTitle = `${branding.portalName} Личный кабинет`

  document.title = appTitle
  setMetaContent('application-name', appTitle)
  setMetaContent('apple-mobile-web-app-title', branding.portalName)
  setMetaContent(
    'description',
    `Личный кабинет ${branding.portalName} для безопасной работы с сообщениями и обращениями.`,
  )
  setMetaContent('theme-color', branding.colors.primary)
}

const TENANTLESS_BRANDING_SCOPE = '__tenantless_public__'

export function BrandingProvider({
  children,
  loadWithoutTenant = false,
}: BrandingProviderProps) {
  const { status: tenantStatus, tenant } = useTenantIdentity()
  const brandingScopeKey =
    tenant?.slug ?? (loadWithoutTenant ? TENANTLESS_BRANDING_SCOPE : null)
  const fallbackBranding = useMemo(
    () => createDefaultPublicBranding(tenant?.displayName),
    [tenant?.displayName],
  )
  const [remoteState, setRemoteState] = useState<RemoteBrandingState>({
    branding: null,
    errorMessage: null,
    status: 'fallback',
    tenantSlug: null,
  })

  useEffect(() => {
    const canLoadTenantBranding =
      tenant && (tenantStatus === 'ready' || tenantStatus === 'ready_cached')
    const canLoadTenantlessBranding = loadWithoutTenant && !tenant

    if (!canLoadTenantBranding && !canLoadTenantlessBranding) {
      return
    }

    const abortController = new AbortController()

    void getPublicBranding({ signal: abortController.signal })
      .then((branding) => {
        setRemoteState({
          branding,
          errorMessage: null,
          status: 'ready',
          tenantSlug: brandingScopeKey,
        })
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) {
          return
        }

        setRemoteState({
          branding: null,
          errorMessage:
            error instanceof Error
              ? error.message
              : 'Оформление временно недоступно.',
          status: 'fallback',
          tenantSlug: brandingScopeKey,
        })
      })

    return () => {
      abortController.abort()
    }
  }, [brandingScopeKey, loadWithoutTenant, tenant, tenantStatus])

  const state = useMemo<BrandingContextValue>(() => {
    const remoteMatchesScope = remoteState.tenantSlug === brandingScopeKey

    if (!tenant && !loadWithoutTenant) {
      return {
        branding: fallbackBranding,
        errorMessage: null,
        status: 'fallback',
      }
    }

    if (
      remoteMatchesScope &&
      remoteState.status === 'ready' &&
      remoteState.branding
    ) {
      return {
        branding: remoteState.branding,
        errorMessage: null,
        status: 'ready',
      }
    }

    if (remoteMatchesScope && remoteState.status === 'fallback') {
      return {
        branding: fallbackBranding,
        errorMessage: remoteState.errorMessage,
        status: 'fallback',
      }
    }

    return {
      branding: fallbackBranding,
      errorMessage: null,
      status: 'loading',
    }
  }, [brandingScopeKey, fallbackBranding, loadWithoutTenant, remoteState, tenant])

  useEffect(() => {
    if (!tenant && !loadWithoutTenant) {
      return
    }

    applyBrandingDocumentMetadata(state.branding)
  }, [loadWithoutTenant, state.branding, tenant])

  const cssProperties = useMemo(
    () => createBrandingCssProperties(state.branding),
    [state.branding],
  )

  return (
    <BrandingContext.Provider value={state}>
      <div
        className="portal-branding-scope"
        data-auth-field-style={state.branding.appearance.authFieldStyle}
        style={cssProperties}
      >
        {children}
      </div>
    </BrandingContext.Provider>
  )
}
