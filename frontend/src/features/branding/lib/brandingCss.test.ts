import { describe, expect, it } from 'vitest'

import type { PublicBranding } from '../api/publicBrandingClient'
import { createDefaultPublicBranding } from './brandingDefaults'
import { createBrandingCssProperties } from './brandingCss'

type BrandingOverrides = Omit<
  Partial<PublicBranding>,
  'appearance' | 'assets' | 'colors' | 'copy' | 'layout'
> & {
  appearance?: Partial<PublicBranding['appearance']>
  assets?: Partial<PublicBranding['assets']>
  colors?: Partial<PublicBranding['colors']>
  copy?: Partial<PublicBranding['copy']>
  layout?: Partial<PublicBranding['layout']>
}

function createBranding(overrides: BrandingOverrides = {}) {
  const defaults = createDefaultPublicBranding('PROVGROUP')

  return {
    ...defaults,
    ...overrides,
    appearance: {
      ...defaults.appearance,
      ...overrides.appearance,
    },
    assets: {
      ...defaults.assets,
      ...overrides.assets,
    },
    colors: {
      ...defaults.colors,
      ...overrides.colors,
    },
    copy: {
      ...defaults.copy,
      ...overrides.copy,
    },
    layout: {
      ...defaults.layout,
      ...overrides.layout,
    },
  } satisfies PublicBranding
}

describe('createBrandingCssProperties', () => {
  it.each([
    ['none', 'rgb(0 0 0 / 0)'],
    ['light', 'rgb(255 255 255 / 0.58)'],
    ['dark', 'rgb(0 0 0 / 0.48)'],
  ] as const)(
    'maps the %s auth background overlay mode to the runtime CSS token',
    (authBackgroundOverlay, expectedOverlay) => {
      const styles = createBrandingCssProperties(
        createBranding({
          appearance: {
            authBackgroundOverlay,
            authButtonStyle: 'solid',
            authColorScheme: 'light',
            authFieldStyle: 'solid',
          },
        }),
      )

      expect(styles['--portal-auth-background-overlay']).toBe(expectedOverlay)
    },
  )

  it('derives full background auth appearance tokens from branding settings', () => {
    const styles = createBrandingCssProperties(
      createBranding({
        appearance: {
          authBackgroundOverlay: 'dark',
          authButtonStyle: 'gradient',
          authColorScheme: 'dark',
          authFieldStyle: 'outline',
        },
        assets: {
          auth_background_image: {
            assetVersion: '14',
            contentType: 'image/png',
            height: null,
            id: 14,
            kind: 'auth_background_image',
            publicUrl: '/api/branding/assets/14?v=14',
            width: null,
          },
        },
        colors: {
          accent: '#14b8a6',
          primary: '#134e4a',
        },
      }),
    )

    expect(styles).toMatchObject({
      '--portal-auth-background-image':
        'url("/api/branding/assets/14?v=14")',
      '--portal-auth-button-background':
        'linear-gradient(180deg, #3d6e6b 0%, #134e4a 56%, #10403d 100%)',
      '--portal-auth-field-style': 'outline',
      '--portal-auth-scheme': 'dark',
    })
    expect(styles['--portal-auth-button-background']).not.toContain('#14b8a6')
  })

  it('keeps solid auth button styling when gradient mode is not selected', () => {
    const styles = createBrandingCssProperties(
      createBranding({
        appearance: {
          authBackgroundOverlay: 'none',
          authButtonStyle: 'solid',
          authColorScheme: 'light',
          authFieldStyle: 'translucent',
        },
        colors: {
          primary: '#003a78',
        },
      }),
    )

    expect(styles).toMatchObject({
      '--portal-auth-button-background': '#003a78',
      '--portal-auth-field-style': 'translucent',
      '--portal-auth-scheme': 'light',
    })
  })
})
