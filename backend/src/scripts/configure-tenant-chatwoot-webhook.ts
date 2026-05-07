import { loadEnv } from '../config/env.js'
import { createDatabaseClient } from '../db/client.js'
import { createChatwootClient } from '../integrations/chatwoot/client.js'
import { createTenantsRepository } from '../modules/tenants/repository.js'
import {
  configureTenantChatwootWebhook,
  createSafeTenantWebhookReport,
} from './configure-tenant-chatwoot-webhook-core.js'

function readArgument(flag: string) {
  const prefix = `${flag}=`
  const argument = process.argv.find((value) => value.startsWith(prefix))

  return argument ? argument.slice(prefix.length).trim() : ''
}

function readTenantSlug(defaultTenantSlug?: string | undefined) {
  const tenantSlug = readArgument('--tenant') || defaultTenantSlug

  if (!tenantSlug?.trim()) {
    throw new Error(
      'Tenant slug is required. Pass --tenant=<slug> or DEFAULT_TENANT_SLUG.',
    )
  }

  return tenantSlug
}

function readTenantSecretKey(tenantSecretKey?: string | undefined) {
  if (!tenantSecretKey?.trim()) {
    throw new Error('PORTAL_TENANT_SECRET_KEY is required.')
  }

  return tenantSecretKey
}

const env = loadEnv()
const database = createDatabaseClient({
  connectionString: env.DATABASE_URL,
})

try {
  const result = await configureTenantChatwootWebhook({
    callbackUrl: readArgument('--callback-url'),
    createChatwootClient: (config) => createChatwootClient({ config }),
    tenantSecretKey: readTenantSecretKey(env.PORTAL_TENANT_SECRET_KEY),
    tenantsRepository: createTenantsRepository(database.db),
    tenantSlug: readTenantSlug(env.DEFAULT_TENANT_SLUG),
  })

  console.log(JSON.stringify(createSafeTenantWebhookReport(result), null, 2))
} finally {
  await database.close()
}
