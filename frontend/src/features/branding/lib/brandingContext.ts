import { createContext } from 'react'

import type { PublicBranding } from '../api/publicBrandingClient'
import { createDefaultPublicBranding } from './brandingDefaults'

export type BrandingStatus = 'fallback' | 'loading' | 'ready'

export type BrandingContextValue = {
  branding: PublicBranding
  errorMessage: string | null
  status: BrandingStatus
}

export const fallbackBrandingContext: BrandingContextValue = {
  branding: createDefaultPublicBranding(),
  errorMessage: null,
  status: 'fallback',
}

export const BrandingContext = createContext<BrandingContextValue>(
  fallbackBrandingContext,
)
