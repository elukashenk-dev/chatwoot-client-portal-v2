import { useContext } from 'react'

import { BrandingContext } from './brandingContext'

export function useBranding() {
  return useContext(BrandingContext)
}
