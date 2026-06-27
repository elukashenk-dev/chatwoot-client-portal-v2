import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

function getCssRule(css: string, selector: string) {
  const selectorIndex = css.indexOf(selector)

  expect(selectorIndex).toBeGreaterThanOrEqual(0)

  const blockStart = css.indexOf('{', selectorIndex)
  const blockEnd = css.indexOf('}', blockStart)

  expect(blockStart).toBeGreaterThanOrEqual(0)
  expect(blockEnd).toBeGreaterThan(blockStart)

  return css.slice(selectorIndex, blockEnd + 1)
}

describe('auth input CSS contract', () => {
  it('uses semantic auth variables for filled and autofill input states', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    const filledRule = getCssRule(css, ".auth-input[data-filled='true']")
    const autofillRule = getCssRule(css, '.auth-input:-webkit-autofill {')

    expect(filledRule).toContain('--portal-auth-control-border-color')
    expect(autofillRule).toContain('--portal-auth-canvas-background-color')
    expect(autofillRule).toContain('--portal-auth-text-color')

    expect(filledRule).not.toContain('rgb(243 247 252 / 0.86)')
    expect(filledRule).not.toContain('#9cb9df')
    expect(autofillRule).not.toContain('rgb(243 247 252 / 0.86)')
  })

  it('defines distinct visual surfaces for branded auth field styles', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    const solidRule = getCssRule(
      css,
      ".portal-branding-scope[data-auth-field-style='solid'] .auth-input:not([aria-invalid='true']) {",
    )
    const translucentRule = getCssRule(
      css,
      ".portal-branding-scope[data-auth-field-style='translucent'] .auth-input:not([aria-invalid='true']) {",
    )
    const outlineRule = getCssRule(
      css,
      ".portal-branding-scope[data-auth-field-style='outline'] .auth-input:not([aria-invalid='true']) {",
    )

    expect(solidRule).toContain('background-color: rgb(255 255 255 / 0.72)')
    expect(solidRule).toContain('--portal-auth-control-border-color')
    expect(solidRule).toContain('box-shadow: 0 10px 24px rgb(15 23 42 / 0.06)')
    expect(translucentRule).toContain(
      'background-color: rgb(255 255 255 / 0.34)',
    )
    expect(translucentRule).toContain('backdrop-filter: blur(8px)')
    expect(translucentRule).toContain('box-shadow: none')
    expect(outlineRule).toContain('background-color: transparent')
    expect(outlineRule).toContain('box-shadow: none')
  })

  it('keeps the mobile auth brand mark size and placement stable', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    const brandMarkRule = getCssRule(css, '.auth-brand-mark--in-flow {')
    const logoRule = getCssRule(
      css,
      '.auth-brand-mark--in-flow .brand-mark-logo {',
    )

    expect(brandMarkRule).toContain('position: static')
    expect(brandMarkRule).toContain('width: 63px')
    expect(brandMarkRule).toContain('height: 63px')
    expect(logoRule).toContain('width: 63px')
    expect(logoRule).toContain('height: 63px')
    expect(logoRule).toContain('--portal-auth-brand-mark-background')
  })

  it('lets uploaded auth logos replace the fallback square with intrinsic sizing', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    const uploadedBrandMarkRule = getCssRule(
      css,
      '.auth-brand-mark--in-flow.brand-mark--uploaded {',
    )
    const uploadedLogoRule = getCssRule(
      css,
      '.auth-brand-mark--in-flow .brand-mark-logo--uploaded {',
    )
    const uploadedImageRule = getCssRule(
      css,
      '.auth-brand-mark--in-flow .brand-mark-image {',
    )

    expect(uploadedBrandMarkRule).toContain('width: auto')
    expect(uploadedBrandMarkRule).toContain('height: auto')
    expect(uploadedBrandMarkRule).toContain('max-width: 100%')
    expect(uploadedLogoRule).toContain('width: auto')
    expect(uploadedLogoRule).toContain('height: auto')
    expect(uploadedLogoRule).toContain('background: transparent')
    expect(uploadedLogoRule).toContain('box-shadow: none')
    expect(uploadedImageRule).toContain('width: auto')
    expect(uploadedImageRule).toContain('height: auto')
    expect(uploadedImageRule).toContain('max-width: min(180px, 100%)')
    expect(uploadedImageRule).toContain('max-height: 63px')
  })

  it('keeps helper notes and legal notices visually distinct', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    const formNoteRule = getCssRule(css, '.auth-form-note {')
    const legalConsentAfterNoteRule = getCssRule(
      css,
      '.auth-form-note + .auth-legal-consent {',
    )
    const legalTextRule = getCssRule(css, '.auth-legal-text {')
    const legalLinkRule = getCssRule(css, '.auth-legal-text a {')

    expect(formNoteRule).toContain('margin: 14px auto 0')
    expect(formNoteRule).toContain('font-size: 14px')
    expect(formNoteRule).toContain('line-height: 22px')
    expect(formNoteRule).toContain('--portal-auth-muted-text-color')
    expect(formNoteRule).toContain('-webkit-hyphens: auto')
    expect(formNoteRule).toContain('hyphens: auto')
    expect(formNoteRule).toContain('overflow-wrap: break-word')
    expect(formNoteRule).toContain('word-break: normal')
    expect(formNoteRule).not.toContain('margin-bottom')
    expect(legalConsentAfterNoteRule).toContain('margin-top: 14px')
    expect(legalTextRule).toContain('margin: 24px auto 0')
    expect(legalTextRule).toContain('font-size: 12px')
    expect(legalTextRule).toContain('line-height: 18px')
    expect(legalTextRule).toContain('hyphens: auto')
    expect(legalLinkRule).toContain('font-weight: 600')
  })

  it('uses a custom auth checkbox style for legal consent', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    const checkboxRule = getCssRule(css, '.auth-legal-consent input {')
    const checkedRule = getCssRule(
      css,
      '.auth-legal-consent input:checked {',
    )
    const checkedMarkRule = getCssRule(
      css,
      '.auth-legal-consent input:checked::after {',
    )
    const focusRule = getCssRule(
      css,
      '.auth-legal-consent input:focus-visible {',
    )

    expect(checkboxRule).toContain('appearance: none')
    expect(checkboxRule).toContain('border: 1px solid')
    expect(checkboxRule).toContain('--portal-auth-control-border-color')
    expect(checkboxRule).toContain('border-radius: 4px')
    expect(checkedRule).toContain('--portal-auth-link-color')
    expect(checkedMarkRule).toContain('border-color: #ffffff')
    expect(focusRule).toContain('outline: none')
    expect(focusRule).toContain('--portal-auth-link-color')
  })

  it('uses the shared branded auth submit button for login and auth flow forms', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    const submitRule = getCssRule(
      css,
      '.auth-login-submit,\n.auth-flow-form > button[type=\'submit\'] {',
    )

    expect(submitRule).toContain('height: 47px')
    expect(submitRule).toContain('border-radius: 9px')
    expect(submitRule).toContain('--portal-auth-button-background')
    expect(submitRule).toContain('--portal-auth-button-text-color')
  })

  it('uses stronger auth error tint for invalid fields and error messages', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    const invalidFieldRule = getCssRule(css, ".auth-input[aria-invalid='true']")
    const fieldMessageRule = getCssRule(css, '.auth-field-message {')
    const formMessageRule = getCssRule(css, '.auth-form-message {')

    expect(invalidFieldRule).toContain('--portal-auth-error-border-color')
    expect(invalidFieldRule).toContain('--portal-auth-error-background-color')
    expect(invalidFieldRule).not.toContain('254 205 211')
    expect(fieldMessageRule).toContain('--portal-auth-error-color')
    expect(formMessageRule).toContain('--portal-auth-error-color')
  })

  it('styles legal document pages as an auth reader surface', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    const readerRule = getCssRule(css, '.legal-document-reader {')
    const titleRule = getCssRule(css, '.legal-document-title {')
    const bodyRule = getCssRule(css, '.legal-document-body {')
    const versionRule = getCssRule(css, '.legal-document-version {')

    expect(readerRule).toContain('max-width: 390px')
    expect(readerRule).toContain('padding: 28px 44px')
    expect(titleRule).toContain('--portal-auth-text-color')
    expect(titleRule).toContain('font-size: 22px')
    expect(titleRule).not.toContain('text-transform: uppercase')
    expect(bodyRule).toContain('--portal-auth-muted-text-color')
    expect(bodyRule).toContain('font-size: 14px')
    expect(bodyRule).toContain('line-height: 22px')
    expect(versionRule).toContain('--portal-auth-muted-text-color')
  })

  it('scopes Inter typography to auth surfaces', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    const frameRule = getCssRule(css, '.auth-frame-background')
    const canvasRule = getCssRule(css, '.auth-canvas-background {')
    const portalFrameRule = getCssRule(css, '.portal-frame-background')

    expect(css).toContain("--portal-auth-font-family: 'Inter'")
    expect(frameRule).toContain('font-family: var(--portal-auth-font-family')
    expect(canvasRule).toContain('font-family: var(--portal-auth-font-family')
    expect(portalFrameRule).not.toContain('--portal-auth-font-family')
  })

  it('loads local Inter font assets for auth typography weights', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

    for (const weight of ['400', '500', '600', '700']) {
      expect(css).toContain(`inter-cyrillic-${weight}-normal.woff2`)
      expect(css).toContain(`inter-latin-${weight}-normal.woff2`)
    }
  })
})
