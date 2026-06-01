import {
  createHash,
  createHmac,
  timingSafeEqual,
  type BinaryLike,
} from 'node:crypto'
import type { IncomingHttpHeaders } from 'node:http'

const CHATWOOT_SIGNATURE_HEADER = 'x-chatwoot-signature'
const CHATWOOT_TIMESTAMP_HEADER = 'x-chatwoot-timestamp'
const WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 5 * 60

export const CHATWOOT_DELIVERY_HEADER = 'x-chatwoot-delivery'

export function readHeader(headers: IncomingHttpHeaders, name: string) {
  const value =
    headers[name] ??
    Object.entries(headers).find(
      ([headerName]) => headerName.toLowerCase() === name,
    )?.[1]

  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

export function createPayloadSha256(payload: BinaryLike) {
  return createHash('sha256').update(payload).digest('hex')
}

export function createSignatureDigest({
  rawBody,
  secret,
  timestamp,
}: {
  rawBody: Buffer
  secret: string
  timestamp: string
}) {
  return `sha256=${createHmac('sha256', secret)
    .update(timestamp)
    .update('.')
    .update(rawBody)
    .digest('hex')}`
}

function isTimingSafeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  return (
    leftBuffer.byteLength === rightBuffer.byteLength &&
    timingSafeEqual(leftBuffer, rightBuffer)
  )
}

export function verifyChatwootSignature({
  headers,
  now,
  rawBody,
  secret,
}: {
  headers: IncomingHttpHeaders
  now: Date
  rawBody: Buffer
  secret: string
}) {
  const signature = readHeader(headers, CHATWOOT_SIGNATURE_HEADER)
  const timestamp = readHeader(headers, CHATWOOT_TIMESTAMP_HEADER)

  if (!signature || !timestamp) {
    return false
  }

  const timestampSeconds = Number(timestamp)

  if (!Number.isInteger(timestampSeconds)) {
    return false
  }

  if (
    Math.abs(Math.floor(now.getTime() / 1000) - timestampSeconds) >
    WEBHOOK_SIGNATURE_TOLERANCE_SECONDS
  ) {
    return false
  }

  const expectedSignature = createSignatureDigest({
    rawBody,
    secret,
    timestamp,
  })

  return isTimingSafeEqual(signature, expectedSignature)
}
