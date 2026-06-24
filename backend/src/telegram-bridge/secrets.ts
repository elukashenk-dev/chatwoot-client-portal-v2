import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'

export class TelegramBridgeSecretError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TelegramBridgeSecretError'
  }
}

type ReadSecretValueInput = {
  filePath?: string
  readStdin?: () => Promise<string>
  stdin?: boolean
}

export function generateBridgeSecret() {
  return randomBytes(32).toString('base64url')
}

function normalizeSecretValue(value: string) {
  const normalized = value.trim()

  if (!normalized) {
    throw new TelegramBridgeSecretError('Secret value must not be empty.')
  }

  return normalized
}

async function readProcessStdin() {
  const chunks: Buffer[] = []

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
  }

  return Buffer.concat(chunks).toString('utf8')
}

export async function readSecretValue({
  filePath,
  readStdin = readProcessStdin,
  stdin = false,
}: ReadSecretValueInput) {
  if (filePath && stdin) {
    throw new TelegramBridgeSecretError('Use only one secret source.')
  }

  if (filePath) {
    return normalizeSecretValue(await readFile(filePath, 'utf8'))
  }

  if (stdin) {
    return normalizeSecretValue(await readStdin())
  }

  throw new TelegramBridgeSecretError('Secret source is required.')
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function maskSecretValue(value: string) {
  const normalizedValue = value.trim()

  if (normalizedValue.length <= 8) {
    return '[redacted]'
  }

  return `${normalizedValue.slice(0, 4)}…${normalizedValue.slice(-4)}`
}

export function redactTelegramBridgeSecrets(
  value: unknown,
  sensitiveValues: string[] = [],
) {
  let redacted = String(value)

  for (const sensitiveValue of sensitiveValues) {
    const normalizedValue = sensitiveValue.trim()

    if (normalizedValue) {
      redacted = redacted.replace(
        new RegExp(escapeRegExp(normalizedValue), 'g'),
        '[redacted]',
      )
    }
  }

  return redacted
    .replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, '[redacted]')
    .replace(
      /\/webhooks\/telegram\/[^/\s?#]+/g,
      '/webhooks/telegram/[redacted]',
    )
    .replace(
      /\/telegram-bridge\/[^/\s]+\/[^/\s?#]+/g,
      '/telegram-bridge/[redacted]',
    )
    .replace(/\+?\d[\d\s().-]{8,}\d/g, '[redacted-phone]')
}
