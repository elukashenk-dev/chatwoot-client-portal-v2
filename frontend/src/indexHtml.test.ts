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
  it('renders a pre-root startup splash before the React bundle loads', () => {
    expect(source).toContain('id="portal-pre-root-startup"')
    expect(source).toContain('Клиентский портал')
    expect(source).toContain('Открываем кабинет')
  })
})
