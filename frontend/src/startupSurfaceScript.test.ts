/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const source = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'public',
    'startup-surface.js',
  ),
  'utf8',
)

describe('startup-surface.js', () => {
  it('marks auth-like routes before the React bundle loads', () => {
    expect(source).toContain('portalStartupSurface')
    expect(source).toContain("path === '/'")
    expect(source).toContain("path.indexOf('/auth') === 0")
    expect(source).toContain("path.indexOf('/admin') === 0")
    expect(source).toContain("path.indexOf('/legal') === 0")
  })
})
