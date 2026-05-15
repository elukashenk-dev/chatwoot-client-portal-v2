import type { AppEnv } from '../config/env.js'
import type { DatabaseClient } from '../db/client.js'
import { portalTenants } from '../db/schema.js'
import {
  decodeTenantSecretKey,
  encryptTenantSecret,
} from '../modules/tenants/secrets.js'

const tenantSecretKey = Buffer.alloc(32, 3).toString('base64')

export const testEnv: AppEnv = {
  APP_ORIGIN: 'http://127.0.0.1:5173',
  CHATWOOT_ACCOUNT_ID: undefined,
  CHATWOOT_API_ACCESS_TOKEN: undefined,
  CHATWOOT_BASE_URL: undefined,
  CHATWOOT_PORTAL_INBOX_ID: undefined,
  DATABASE_URL:
    'postgres://test:test@127.0.0.1:5432/chatwoot_client_portal_v2_test',
  NODE_ENV: 'test',
  PORT: 3301,
  PORTAL_TRUST_PROXY: false,
  PORTAL_TENANT_SECRET_KEY: tenantSecretKey,
  SESSION_COOKIE_NAME: 'portal_session',
  SESSION_SECRET: 'test-session-secret-with-at-least-thirty-two-characters',
  SESSION_TTL_DAYS: 14,
  SMTP_FROM: undefined,
  SMTP_HOST: undefined,
  SMTP_PASS: undefined,
  SMTP_PORT: 1025,
  SMTP_SECURE: false,
  SMTP_USER: undefined,
}

export async function seedDefaultTenant(database: DatabaseClient) {
  const key = decodeTenantSecretKey(tenantSecretKey)

  const [tenant] = await database.db
    .insert(portalTenants)
    .values({
      chatwootAccountId: 1,
      chatwootApiAccessTokenCiphertext: encryptTenantSecret(
        'test-api-token',
        key,
      ),
      chatwootBaseUrl: 'https://chatwoot.example.test',
      chatwootPortalInboxId: 1,
      chatwootWebhookSecretCiphertext: encryptTenantSecret(
        'test-webhook-secret',
        key,
      ),
      displayName: 'Local Test Tenant',
      primaryDomain: 'localhost',
      publicBaseUrl: testEnv.APP_ORIGIN,
      slug: 'default',
    })
    .returning({
      id: portalTenants.id,
    })

  if (!tenant) {
    throw new Error('Failed to seed default tenant.')
  }

  return tenant.id
}

export function createMultipartAttachmentPayload({
  clientMessageKey,
  content,
  fileContent,
  fileName,
  mimeType,
  replyToMessageId,
  threadId,
}: {
  clientMessageKey: string
  content?: string
  fileContent: Buffer
  fileName: string
  mimeType: string
  replyToMessageId?: number
  threadId: string
}) {
  const boundary = '----portal-test-boundary'
  const chunks: Buffer[] = []
  const appendField = (name: string, value: string) => {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    )
  }

  appendField('clientMessageKey', clientMessageKey)

  if (content !== undefined) {
    appendField('content', content)
  }

  appendField('threadId', threadId)

  if (replyToMessageId !== undefined) {
    appendField('replyToMessageId', String(replyToMessageId))
  }

  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="attachment"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ),
  )
  chunks.push(fileContent)
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`))

  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    payload: Buffer.concat(chunks),
  }
}
