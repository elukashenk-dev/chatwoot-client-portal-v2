/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'index.css'),
  'utf8',
)

function getCssRule(selector: string) {
  const selectorIndex = source.indexOf(selector)

  if (selectorIndex === -1) {
    throw new Error(`Missing selector: ${selector}`)
  }

  const blockStart = source.indexOf('{', selectorIndex)
  const blockEnd = source.indexOf('}', blockStart)

  return source.slice(selectorIndex, blockEnd + 1)
}

function getCssRuleBySelectors(selectors: string[]) {
  const normalizedSelectors = selectors.map(normalizeCssSelector)
  const rules = source.match(/[^{}]+{[^{}]*}/g) ?? []

  for (const rule of rules) {
    const selectorText = rule.slice(0, rule.indexOf('{'))
    const ruleSelectors = selectorText.split(',').map(normalizeCssSelector)

    if (
      normalizedSelectors.every((selector) => ruleSelectors.includes(selector))
    ) {
      return rule
    }
  }

  throw new Error(`Missing selector group: ${selectors.join(', ')}`)
}

function normalizeCssSelector(selector: string) {
  return selector.replace(/\s+/g, ' ').trim()
}

describe('index.css', () => {
  it('aligns the initial document background with the cached chat surface', () => {
    expect(source).toContain('body {')
    expect(source).toContain('background: #fff;')
  })

  it('uses the auth canvas fallback for auth-like startup routes', () => {
    const startupRule = getCssRuleBySelectors([
      "html[data-portal-startup-surface='auth']",
      "html[data-portal-startup-surface='auth'] body",
      "html[data-portal-startup-surface='auth'] #root",
    ])

    expect(startupRule).toContain('background: #f3f7fc;')
  })

  it('hides the chat transcript scrollbar on mobile viewports', () => {
    expect(source).toMatch(
      /@media\s*\(\s*max-width:\s*640px\s*\)\s*{[\s\S]*\.chat-scroll\s*{[\s\S]*scrollbar-width:\s*none;[\s\S]*-ms-overflow-style:\s*none;[\s\S]*\.chat-scroll::-webkit-scrollbar\s*{[\s\S]*display:\s*none;[\s\S]*width:\s*0;[\s\S]*height:\s*0;/,
    )
  })

  it('keeps outgoing chat bubbles flat without shadows or gradient overlays', () => {
    const outgoingRule = getCssRule('.chat-outgoing-surface {')

    expect(outgoingRule).toContain(
      'background-color: var(--color-chat-outgoing);',
    )
    expect(outgoingRule).toContain('box-shadow: none;')
    expect(outgoingRule).not.toContain('background-image')
    expect(outgoingRule).not.toContain('linear-gradient')
  })

  it('keeps incoming chat bubbles light, flat, and softly outlined', () => {
    const incomingRule = getCssRuleBySelectors(['.chat-incoming-surface'])

    expect(incomingRule).toContain('background: #f7f7f7;')
    expect(incomingRule).toContain(
      'border-color: rgb(203 213 225 / 0.4);',
    )
    expect(incomingRule).toContain('box-shadow: none;')
    expect(incomingRule).not.toContain('linear-gradient')
    expect(incomingRule).not.toContain('backdrop-filter')
  })

  it('uses the outgoing chat brand token for the composer send control', () => {
    const sendControlRule = getCssRule('.chat-send-control {')

    expect(sendControlRule).toContain(
      'background-color: var(--color-chat-outgoing);',
    )
    expect(sendControlRule).not.toContain(
      '--portal-chat-outgoing-background-color',
    )
  })

  it('uses chat header branding tokens for the actual floating header surface', () => {
    const floatingHeaderRule = getCssRule('.chat-floating-header-surface {')

    expect(floatingHeaderRule).toContain(
      '--portal-chat-header-surface-background-color',
    )
    expect(floatingHeaderRule).toContain(
      '--portal-chat-header-surface-background-image',
    )
    expect(floatingHeaderRule).toContain('--portal-chat-header-border-color')
    expect(floatingHeaderRule).toContain(
      'color: var(--portal-chat-header-foreground, #0f172a);',
    )
  })

  it('keeps floating header and composer overlays lightly translucent', () => {
    const sharedFloatingRule = getCssRuleBySelectors([
      '.chat-floating-header-surface',
      '.chat-floating-composer-surface',
    ])
    const floatingHeaderRule = getCssRule('.chat-floating-header-surface {')

    expect(sharedFloatingRule).toContain('rgb(255 255 255 / 0.30)')
    expect(sharedFloatingRule).toContain('rgb(255 255 255 / 0.15)')
    expect(floatingHeaderRule).toContain('rgb(255 255 255 / 0.30)')
    expect(floatingHeaderRule).toContain('rgb(255 255 255 / 0.15)')
  })

  it('keeps auth mobile bottom inset from creating a false scrollbar', () => {
    const mediaStart = source.indexOf('@media (max-width: 430px) {')

    expect(mediaStart).toBeGreaterThanOrEqual(0)

    const nextMediaStart = source.indexOf('@media', mediaStart + 1)
    const mobileBlock = source.slice(
      mediaStart,
      nextMediaStart === -1 ? source.length : nextMediaStart,
    )

    expect(mobileBlock).toContain('.auth-stack {')
    expect(mobileBlock).toContain(
      'padding-bottom: calc(2.5rem + env(safe-area-inset-bottom));',
    )
    expect(mobileBlock).not.toContain('--auth-stack-top')
  })

  it('hides auth frame tiny overflow without disabling real auth scrolling', () => {
    const tinyOverflowRule = getCssRule(
      ".auth-frame-scroll-area[data-tiny-overflow='true'] {",
    )

    expect(tinyOverflowRule).toContain('overflow-y: hidden;')
  })

  it('tightens auth vertical rhythm only on short mobile viewports', () => {
    const mediaStart = source.indexOf(
      '@media (max-width: 430px) and (max-height: 780px) {',
    )

    expect(mediaStart).toBeGreaterThanOrEqual(0)

    const nextMediaStart = source.indexOf('@media', mediaStart + 1)
    const compactBlock = source.slice(
      mediaStart,
      nextMediaStart === -1 ? source.length : nextMediaStart,
    )

    expect(compactBlock).toContain('--auth-stack-top: 36px;')
    expect(compactBlock).toContain('margin-top: 30px;')
    expect(compactBlock).toContain('margin-top: 31px;')
    expect(compactBlock).toContain('margin-top: 18px;')
    expect(compactBlock).toContain('margin-top: 22px;')
    expect(compactBlock).toContain('grid-template-columns: 1fr 56px 1fr;')
    expect(compactBlock).not.toContain('height: 40px')
    expect(compactBlock).not.toContain('width: 48px')
  })

  it('uses a smaller auth bottom inset on very short PWA mobile viewports', () => {
    const mediaStart = source.indexOf(
      '@media (max-width: 430px) and (max-height: 720px) {',
    )

    expect(mediaStart).toBeGreaterThanOrEqual(0)

    const nextMediaStart = source.indexOf('@media', mediaStart + 1)
    const pwaBlock = source.slice(
      mediaStart,
      nextMediaStart === -1 ? source.length : nextMediaStart,
    )

    expect(pwaBlock).toContain('.auth-stack {')
    expect(pwaBlock).toContain(
      'padding-bottom: calc(1.25rem + env(safe-area-inset-bottom));',
    )
  })
})
