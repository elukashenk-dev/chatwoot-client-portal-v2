/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'index.css'),
  'utf8',
)

describe('index.css', () => {
  it('aligns the initial document background with the pwa startup surface', () => {
    expect(source).toContain('body {')
    expect(source).toContain('background: #f3f7fc;')
  })

  it('hides the chat transcript scrollbar on mobile viewports', () => {
    expect(source).toMatch(
      /@media\s*\(\s*max-width:\s*640px\s*\)\s*{[\s\S]*\.chat-scroll\s*{[\s\S]*scrollbar-width:\s*none;[\s\S]*-ms-overflow-style:\s*none;[\s\S]*\.chat-scroll::-webkit-scrollbar\s*{[\s\S]*display:\s*none;[\s\S]*width:\s*0;[\s\S]*height:\s*0;/,
    )
  })
})
