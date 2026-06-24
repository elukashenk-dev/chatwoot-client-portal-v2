import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, it } from 'vitest'

import {
  generateBridgeSecret,
  maskSecretValue,
  readSecretValue,
  redactTelegramBridgeSecrets,
} from './secrets.js'

describe('telegram bridge secret helpers', () => {
  it('generates URL-safe secret values', () => {
    const secret = generateBridgeSecret()

    expect(secret.length).toBeGreaterThanOrEqual(32)
    expect(secret).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('reads secret values from files or stdin and trims whitespace', async () => {
    const directory = join(tmpdir(), `telegram-bridge-secrets-${Date.now()}`)
    await mkdir(directory, {
      recursive: true,
    })
    const tokenPath = join(directory, 'token.txt')
    await writeFile(tokenPath, ' 1234567890:AAExampleTelegramBotTokenSecretValue \n')

    await expect(
      readSecretValue({
        filePath: tokenPath,
      }),
    ).resolves.toBe('1234567890:AAExampleTelegramBotTokenSecretValue')

    await expect(
      readSecretValue({
        readStdin: async () => ' stdin-secret \n',
        stdin: true,
      }),
    ).resolves.toBe('stdin-secret')
  })

  it('rejects empty secret inputs and conflicting file/stdin sources', async () => {
    await expect(
      readSecretValue({
        readStdin: async () => '   ',
        stdin: true,
      }),
    ).rejects.toThrow(/must not be empty/)

    await expect(
      readSecretValue({
        filePath: '/tmp/token.txt',
        stdin: true,
      }),
    ).rejects.toThrow(/only one secret source/)
  })

  it('masks CLI output and error text without exposing token, path secret, header secret or phone', () => {
    const raw =
      'POST https://app.example.test/webhooks/telegram/1234567890:AAExampleTelegramBotTokenSecretValue ' +
      '/telegram-bridge/prov/path-secret +79161234567 header-secret'

    const redacted = redactTelegramBridgeSecrets(raw, [
      '1234567890:AAExampleTelegramBotTokenSecretValue',
      'path-secret',
      'header-secret',
    ])

    expect(redacted).not.toContain('1234567890:AAExampleTelegramBotTokenSecretValue')
    expect(redacted).not.toContain('path-secret')
    expect(redacted).not.toContain('header-secret')
    expect(redacted).not.toContain('+79161234567')
    expect(maskSecretValue('1234567890:AAExampleTelegramBotTokenSecretValue')).toBe(
      '1234…alue',
    )
  })
})
