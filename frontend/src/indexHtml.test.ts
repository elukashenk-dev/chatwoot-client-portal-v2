/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'),
  'utf8',
)

describe('index.html', () => {
  it('marks auth-like routes with a startup surface before React loads', () => {
    expect(source).toContain('portalStartupSurface')
    expect(source).toContain("path.indexOf('/auth') === 0")
    expect(source).toContain("path.indexOf('/admin') === 0")
    expect(source).toContain("path.indexOf('/legal') === 0")
    expect(source).toContain('background: #f3f7fc;')
  })

  it('does not render a portal-owned startup splash before the React bundle loads', () => {
    expect(source).not.toContain('id="portal-pre-root-startup"')
    expect(source).not.toContain('Открываем кабинет')
    expect(source).not.toContain('Готовим чат')
    expect(source).not.toContain('Загружаем экран')
  })
})
