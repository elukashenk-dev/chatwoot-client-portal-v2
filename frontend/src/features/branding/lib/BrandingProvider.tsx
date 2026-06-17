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

export function BrandingProvider({ children }: BrandingProviderProps) {
  const { status: tenantStatus, tenant } = useTenantIdentity()
  const tenantSlug = tenant?.slug ?? null
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
    if (
      !tenant ||
      (tenantStatus !== 'ready' && tenantStatus !== 'ready_cached')
    ) {
      return
    }

    const abortController = new AbortController()

    void getPublicBranding({ signal: abortController.signal })
      .then((branding) => {
        setRemoteState({
          branding,
          errorMessage: null,
          status: 'ready',
          tenantSlug: tenant.slug,
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
          tenantSlug: tenant.slug,
        })
      })

    return () => {
      abortController.abort()
    }
  }, [tenant, tenantStatus])

  const state = useMemo<BrandingContextValue>(() => {
    const remoteMatchesTenant = remoteState.tenantSlug === tenantSlug

    if (!tenant) {
      return {
        branding: fallbackBranding,
        errorMessage: null,
        status: 'fallback',
      }
    }

    if (
      remoteMatchesTenant &&
      remoteState.status === 'ready' &&
      remoteState.branding
    ) {
      return {
        branding: remoteState.branding,
        errorMessage: null,
        status: 'ready',
      }
    }

    if (remoteMatchesTenant && remoteState.status === 'fallback') {
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
  }, [fallbackBranding, remoteState, tenant, tenantSlug])

  useEffect(() => {
    if (!tenant) {
      return
    }

    applyBrandingDocumentMetadata(state.branding)
  }, [state.branding, tenant])

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
