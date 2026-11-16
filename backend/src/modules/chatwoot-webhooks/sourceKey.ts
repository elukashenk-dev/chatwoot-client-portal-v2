import { createHash } from 'node:crypto'

export function createWebhookSourceKey(source: {
  accountId: number
  inboxId: number
  baseUrl: string
}) {
  return createHash('sha256')
    .update(`${source.baseUrl}|${source.accountId}|${source.inboxId}`)
    .digest('hex')
    .slice(0, 24)
}
