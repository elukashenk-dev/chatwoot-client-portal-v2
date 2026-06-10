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
})
