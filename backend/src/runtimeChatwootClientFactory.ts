import type { AppEnv } from './config/env.js'
import { createChatwootClientFactory } from './integrations/chatwoot/client.js'

type RuntimeChatwootClientFactoryOptions = {
  chatwootFetchFn?: typeof fetch | undefined
  env: Pick<AppEnv, 'CHATWOOT_REQUEST_TIMEOUT_MS'>
}

export function getAttachmentProxyAllowedOrigins({
  env,
  tenantChatwootBaseUrl,
}: {
  env: Pick<AppEnv, 'CHAT_ATTACHMENT_PROXY_ALLOWED_ORIGINS'>
  tenantChatwootBaseUrl: string
}) {
  return [tenantChatwootBaseUrl, ...env.CHAT_ATTACHMENT_PROXY_ALLOWED_ORIGINS]
}

export function createRuntimeChatwootClientFactory({
  chatwootFetchFn,
  env,
}: RuntimeChatwootClientFactoryOptions) {
  return createChatwootClientFactory({
    ...(chatwootFetchFn ? { fetchFn: chatwootFetchFn } : {}),
    requestTimeoutMs: env.CHATWOOT_REQUEST_TIMEOUT_MS,
  })
}
