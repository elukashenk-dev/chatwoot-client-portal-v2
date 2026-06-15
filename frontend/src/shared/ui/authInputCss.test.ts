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

    expect(filledRule).toContain('--portal-auth-control-background')
    expect(filledRule).toContain('--portal-auth-control-border-color')
    expect(autofillRule).toContain('--portal-auth-control-background')
    expect(autofillRule).toContain('--portal-auth-text-color')

    expect(filledRule).not.toContain('rgb(243 247 252 / 0.86)')
    expect(filledRule).not.toContain('#9cb9df')
    expect(autofillRule).not.toContain('rgb(243 247 252 / 0.86)')
  })

  it('keeps the mobile auth brand mark size and placement stable', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    const brandMarkRule = getCssRule(css, '.auth-brand-mark {')
    const logoRule = getCssRule(css, '.auth-brand-mark .brand-mark-logo {')

    expect(brandMarkRule).toContain('top: 52px')
    expect(logoRule).toContain('width: 63px')
    expect(logoRule).toContain('height: 63px')
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
