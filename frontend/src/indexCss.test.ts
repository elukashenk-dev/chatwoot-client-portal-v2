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

describe('index.css', () => {
  it('aligns the initial document background with the cached chat surface', () => {
    expect(source).toContain('body {')
    expect(source).toContain('background: #fff;')
  })

  it('hides the chat transcript scrollbar on mobile viewports', () => {
    expect(source).toMatch(
      /@media\s*\(\s*max-width:\s*640px\s*\)\s*{[\s\S]*\.chat-scroll\s*{[\s\S]*scrollbar-width:\s*none;[\s\S]*-ms-overflow-style:\s*none;[\s\S]*\.chat-scroll::-webkit-scrollbar\s*{[\s\S]*display:\s*none;[\s\S]*width:\s*0;[\s\S]*height:\s*0;/,
    )
  })

  it('keeps outgoing chat bubbles flat without gradient overlays', () => {
    const outgoingRule = getCssRule('.chat-outgoing-surface {')

    expect(outgoingRule).toContain(
      'background-color: var(--color-chat-outgoing);',
    )
    expect(outgoingRule).not.toContain('background-image')
    expect(outgoingRule).not.toContain('linear-gradient')
  })
})
