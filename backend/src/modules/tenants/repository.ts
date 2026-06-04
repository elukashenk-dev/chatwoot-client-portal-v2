import { eq, sql } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import { portalTenants } from '../../db/schema.js'

export const tenantStatuses = [
  'active',
  'suspended',
  'provisioning',
  'archived',
] as const

export type TenantStatus = (typeof tenantStatuses)[number]

export type Tenant = typeof portalTenants.$inferSelect

export class TenantValidationError extends Error {
  constructor(message: string) {
    super(message)

    this.name = 'TenantValidationError'
  }
}

type TenantInput = {
  chatwootAccountId: number
  chatwootApiAccessTokenCiphertext: string
  chatwootBaseUrl: string
  chatwootPortalInboxId: number
  chatwootWebhookSecretCiphertext: string
  displayName: string
  primaryDomain: string
  publicBaseUrl: string
  slug: string
  status?: TenantStatus
}

type UpdateTenantWebhookSecretInput = {
  chatwootWebhookSecretCiphertext: string
  tenantId: number
  updatedAt?: Date
}

type UpdateTenantPortalInboxIdentifierInput = {
  chatwootPortalInboxIdentifier: string
  tenantId: number
  updatedAt?: Date
}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const domainPattern =
  /^(?:localhost|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*)$/
const allowedTenantStatuses = new Set<string>(tenantStatuses)

function normalizeSlug(slug: string) {
  const normalizedSlug = slug.trim().toLowerCase()

  if (!slugPattern.test(normalizedSlug)) {
    throw new TenantValidationError(
      'Tenant slug must contain lowercase letters, numbers and single hyphens.',
    )
  }

  return normalizedSlug
}

function normalizeDomain(domain: string) {
  const normalizedDomain = domain.trim().toLowerCase().replace(/\.$/, '')

  if (
    normalizedDomain.includes('://') ||
    normalizedDomain.includes('/') ||
    normalizedDomain.includes('?') ||
    normalizedDomain.includes('#') ||
    normalizedDomain.includes(':') ||
    !domainPattern.test(normalizedDomain)
  ) {
    throw new TenantValidationError(
      'Tenant primary domain must be a host without protocol, path or port.',
    )
  }

  return normalizedDomain
}

function normalizeUrl(url: string, fieldName: string) {
  let parsedUrl: URL

  try {
    parsedUrl = new URL(url.trim())
  } catch {
    throw new TenantValidationError(`${fieldName} must be a valid URL.`)
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new TenantValidationError(`${fieldName} must use http or https.`)
  }

  parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, '')
  parsedUrl.search = ''
  parsedUrl.hash = ''

  return parsedUrl.toString().replace(/\/$/, '')
}

function readUrlHostname(url: string, fieldName: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, '')
  } catch {
    throw new TenantValidationError(`${fieldName} must be a valid URL.`)
  }
}

function assertPublicBaseUrlMatchesPrimaryDomain({
  primaryDomain,
  publicBaseUrl,
}: {
  primaryDomain: string
  publicBaseUrl: string
}) {
  const publicHostname = readUrlHostname(publicBaseUrl, 'publicBaseUrl')

  if (publicHostname !== primaryDomain) {
    throw new TenantValidationError(
      'Tenant publicBaseUrl hostname must match primaryDomain.',
    )
  }
}

function normalizePositiveInteger(value: number, fieldName: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TenantValidationError(`${fieldName} must be a positive integer.`)
  }

  return value
}

function normalizeNonEmptyString(value: string, fieldName: string) {
  const normalizedValue = value.trim()

  if (!normalizedValue) {
    throw new TenantValidationError(`${fieldName} is required.`)
  }

  return normalizedValue
}

function normalizeTenantStatus(status: TenantStatus | undefined) {
  const normalizedStatus = status ?? 'active'

  if (!allowedTenantStatuses.has(normalizedStatus)) {
    throw new TenantValidationError('Tenant status is not supported.')
  }

  return normalizedStatus
}

function normalizeTenantInput(input: TenantInput) {
  const primaryDomain = normalizeDomain(input.primaryDomain)
  const publicBaseUrl = normalizeUrl(input.publicBaseUrl, 'publicBaseUrl')

  assertPublicBaseUrlMatchesPrimaryDomain({
    primaryDomain,
    publicBaseUrl,
  })

  return {
    chatwootAccountId: normalizePositiveInteger(
      input.chatwootAccountId,
      'chatwootAccountId',
    ),
    chatwootApiAccessTokenCiphertext: normalizeNonEmptyString(
      input.chatwootApiAccessTokenCiphertext,
      'chatwootApiAccessTokenCiphertext',
    ),
    chatwootBaseUrl: normalizeUrl(input.chatwootBaseUrl, 'chatwootBaseUrl'),
    chatwootPortalInboxId: normalizePositiveInteger(
      input.chatwootPortalInboxId,
      'chatwootPortalInboxId',
    ),
    chatwootWebhookSecretCiphertext: normalizeNonEmptyString(
      input.chatwootWebhookSecretCiphertext,
      'chatwootWebhookSecretCiphertext',
    ),
    displayName: normalizeNonEmptyString(input.displayName, 'displayName'),
    primaryDomain,
    publicBaseUrl,
    slug: normalizeSlug(input.slug),
    status: normalizeTenantStatus(input.status),
  }
}

export function createTenantsRepository(db: AppDatabase) {
  return {
    async createTenant(input: TenantInput) {
      const normalizedInput = normalizeTenantInput(input)

      const [createdTenant] = await db
        .insert(portalTenants)
        .values(normalizedInput)
        .returning()

      if (!createdTenant) {
        throw new Error('Failed to create tenant.')
      }

      return createdTenant
    },

    async findByPrimaryDomain(primaryDomain: string) {
      const normalizedDomain = normalizeDomain(primaryDomain)

      const [tenant] = await db
        .select()
        .from(portalTenants)
        .where(eq(portalTenants.primaryDomain, normalizedDomain))
        .limit(1)

      return tenant ?? null
    },

    async findBySlug(slug: string) {
      const normalizedSlug = normalizeSlug(slug)

      const [tenant] = await db
        .select()
        .from(portalTenants)
        .where(eq(portalTenants.slug, normalizedSlug))
        .limit(1)

      return tenant ?? null
    },

    async listTenants() {
      return db
        .select()
        .from(portalTenants)
        .orderBy(sql`${portalTenants.slug} asc`)
    },

    async updateChatwootWebhookSecretCiphertext({
      chatwootWebhookSecretCiphertext,
      tenantId,
      updatedAt = new Date(),
    }: UpdateTenantWebhookSecretInput) {
      const [tenant] = await db
        .update(portalTenants)
        .set({
          chatwootWebhookSecretCiphertext: normalizeNonEmptyString(
            chatwootWebhookSecretCiphertext,
            'chatwootWebhookSecretCiphertext',
          ),
          updatedAt,
        })
        .where(eq(portalTenants.id, tenantId))
        .returning()

      if (!tenant) {
        throw new Error('Failed to update tenant Chatwoot webhook secret.')
      }

      return tenant
    },

    async updateChatwootPortalInboxIdentifier({
      chatwootPortalInboxIdentifier,
      tenantId,
      updatedAt = new Date(),
    }: UpdateTenantPortalInboxIdentifierInput) {
      const [tenant] = await db
        .update(portalTenants)
        .set({
          chatwootPortalInboxIdentifier: normalizeNonEmptyString(
            chatwootPortalInboxIdentifier,
            'chatwootPortalInboxIdentifier',
          ),
          updatedAt,
        })
        .where(eq(portalTenants.id, tenantId))
        .returning()

      if (!tenant) {
        throw new Error(
          'Failed to update tenant Chatwoot portal inbox identifier.',
        )
      }

      return tenant
    },

    async upsertTenantBySlug(input: TenantInput) {
      const normalizedInput = normalizeTenantInput(input)
      const now = new Date()

      const [tenant] = await db
        .insert(portalTenants)
        .values(normalizedInput)
        .onConflictDoUpdate({
          set: {
            chatwootAccountId: normalizedInput.chatwootAccountId,
            chatwootApiAccessTokenCiphertext:
              normalizedInput.chatwootApiAccessTokenCiphertext,
            chatwootBaseUrl: normalizedInput.chatwootBaseUrl,
            chatwootPortalInboxId: normalizedInput.chatwootPortalInboxId,
            chatwootWebhookSecretCiphertext:
              normalizedInput.chatwootWebhookSecretCiphertext,
            displayName: normalizedInput.displayName,
            primaryDomain: normalizedInput.primaryDomain,
            publicBaseUrl: normalizedInput.publicBaseUrl,
            status: normalizedInput.status,
            updatedAt: now,
          },
          target: portalTenants.slug,
        })
        .returning()

      if (!tenant) {
        throw new Error('Failed to upsert tenant.')
      }

      return tenant
    },
  }
}

export type TenantsRepository = ReturnType<typeof createTenantsRepository>
