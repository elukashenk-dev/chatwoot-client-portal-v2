import { and, eq, isNull, or, sql } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import {
  tenantProvisioningRuns,
  type TenantProvisioningRun,
} from '../../db/schema.js'
import { normalizeEmail } from '../../lib/email.js'
import {
  normalizeDomain,
  normalizeNonEmptyString,
  normalizePositiveInteger,
  normalizeSlug,
  normalizeUrl,
  TenantValidationError,
} from '../tenants/repository.js'

export const provisioningStatuses = [
  'pending',
  'creating_chatwoot_account',
  'creating_client_admin',
  'creating_runtime_user',
  'creating_admin_verification_user',
  'creating_portal_inbox',
  'creating_portal_tenant',
  'verifying',
  'completed',
  'failed',
] as const

export type ProvisioningStatus = (typeof provisioningStatuses)[number]

export const tenantProvisioningDomainModes = [
  'custom_domain',
  'provider_subdomain',
] as const

export type TenantProvisioningDomainMode =
  (typeof tenantProvisioningDomainModes)[number]

export type TenantProvisioningInput = {
  chatwootBaseUrl: string
  clientAdminEmail: string
  clientAdminName: string
  displayName: string
  domainMode: TenantProvisioningDomainMode
  metadata?: Record<string, unknown>
  primaryDomain: string
  providerSubdomain?: string | null
  providerTenantDomainSuffix?: string | null
  publicBaseUrl: string
  slug: string
}

type NormalizedTenantProvisioningInput = {
  chatwootBaseUrl: string
  clientAdminEmail: string
  clientAdminName: string
  displayName: string
  domainMode: TenantProvisioningDomainMode
  metadata: Record<string, unknown>
  primaryDomain: string
  providerSubdomain: string | null
  providerTenantDomainSuffix: string | null
  publicBaseUrl: string
  slug: string
}

export class TenantProvisioningConflictError extends Error {
  constructor(fieldName: string) {
    super(`Provisioning input mismatch for ${fieldName}.`)

    this.name = 'TenantProvisioningConflictError'
  }
}

const allowedProvisioningStatuses = new Set<string>(provisioningStatuses)
const sensitiveMetadataKeyPattern = /token|secret|password|ciphertext/i
const terminalProvisioningStatuses = new Set<ProvisioningStatus>([
  'completed',
  'failed',
])

function normalizeDomainMode(domainMode: TenantProvisioningDomainMode) {
  if (!tenantProvisioningDomainModes.includes(domainMode)) {
    throw new TenantValidationError(
      'Tenant provisioning domain mode is not supported.',
    )
  }

  return domainMode
}

function normalizeNullableSlug(value: string | null | undefined) {
  if (value === null || value === undefined || !value.trim()) {
    return null
  }

  return normalizeSlug(value)
}

function normalizeNullableDomain(value: string | null | undefined) {
  if (value === null || value === undefined || !value.trim()) {
    return null
  }

  return normalizeDomain(value)
}

function normalizeMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return metadata ? { ...metadata } : {}
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
      'Tenant provisioning publicBaseUrl hostname must match primaryDomain.',
    )
  }
}

function normalizeProvisioningStatus(status: ProvisioningStatus) {
  if (!allowedProvisioningStatuses.has(status)) {
    throw new TenantValidationError('Provisioning status is not supported.')
  }

  return status
}

function normalizeForComparison(
  input: TenantProvisioningInput,
): NormalizedTenantProvisioningInput {
  const primaryDomain = normalizeDomain(input.primaryDomain)
  const publicBaseUrl = normalizeUrl(input.publicBaseUrl, 'publicBaseUrl')

  return {
    chatwootBaseUrl: normalizeUrl(input.chatwootBaseUrl, 'chatwootBaseUrl'),
    clientAdminEmail: normalizeEmail(input.clientAdminEmail),
    clientAdminName: normalizeNonEmptyString(
      input.clientAdminName,
      'clientAdminName',
    ),
    displayName: normalizeNonEmptyString(input.displayName, 'displayName'),
    domainMode: normalizeDomainMode(input.domainMode),
    metadata: normalizeMetadata(input.metadata),
    primaryDomain,
    providerSubdomain: normalizeNullableSlug(input.providerSubdomain),
    providerTenantDomainSuffix: normalizeNullableDomain(
      input.providerTenantDomainSuffix,
    ),
    publicBaseUrl,
    slug: normalizeSlug(input.slug),
  }
}

function normalizeNewRunInput(
  input: TenantProvisioningInput,
): NormalizedTenantProvisioningInput {
  const normalizedInput = normalizeForComparison(input)

  assertPublicBaseUrlMatchesPrimaryDomain(normalizedInput)

  if (normalizedInput.domainMode === 'custom_domain') {
    if (
      normalizedInput.providerSubdomain ||
      normalizedInput.providerTenantDomainSuffix
    ) {
      throw new TenantValidationError(
        'Provider subdomain fields are not allowed for custom domain provisioning.',
      )
    }

    return normalizedInput
  }

  if (
    !normalizedInput.providerSubdomain ||
    !normalizedInput.providerTenantDomainSuffix
  ) {
    throw new TenantValidationError(
      'Provider subdomain and domain suffix are required.',
    )
  }

  if (normalizedInput.providerSubdomain !== normalizedInput.slug) {
    throw new TenantValidationError(
      'Provider subdomain must match tenant slug.',
    )
  }

  if (
    normalizedInput.primaryDomain !==
    `${normalizedInput.providerSubdomain}.${normalizedInput.providerTenantDomainSuffix}`
  ) {
    throw new TenantValidationError(
      'Provider primary domain must match provider subdomain and suffix.',
    )
  }

  return normalizedInput
}

function assertImmutableFieldsMatch(
  existingRun: TenantProvisioningRun,
  normalizedInput: NormalizedTenantProvisioningInput,
) {
  const immutableFields = [
    'domainMode',
    'primaryDomain',
    'publicBaseUrl',
    'providerSubdomain',
    'providerTenantDomainSuffix',
    'chatwootBaseUrl',
    'clientAdminEmail',
    'clientAdminName',
  ] as const

  for (const fieldName of immutableFields) {
    if (existingRun[fieldName] !== normalizedInput[fieldName]) {
      throw new TenantProvisioningConflictError(fieldName)
    }
  }
}

function redactSensitiveMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveMetadata(item))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        sensitiveMetadataKeyPattern.test(key)
          ? '[redacted]'
          : redactSensitiveMetadata(nestedValue),
      ]),
    )
  }

  return value
}

function redactSensitiveText(value: string | null) {
  if (!value) {
    return value
  }

  return sensitiveMetadataKeyPattern.test(value) ? '[redacted]' : value
}

export function toSafeTenantProvisioningRunReport(
  run: TenantProvisioningRun,
): TenantProvisioningRun {
  return {
    ...run,
    lastError: redactSensitiveText(run.lastError),
    metadata: redactSensitiveMetadata(run.metadata) as Record<string, unknown>,
  }
}

export type TenantProvisioningRepository = {
  createOrResumeRun(
    input: TenantProvisioningInput,
  ): Promise<TenantProvisioningRun>
  listCompletedRuns(): Promise<TenantProvisioningRun[]>
  markCompleted(input: { id: number }): Promise<TenantProvisioningRun>
  markFailed(input: {
    id: number
    message: string
  }): Promise<TenantProvisioningRun>
  markStatus(input: {
    id: number
    status: ProvisioningStatus
  }): Promise<TenantProvisioningRun>
  storeAdminVerificationServiceUserId(input: {
    adminVerificationServiceUserId: number
    id: number
  }): Promise<TenantProvisioningRun>
  storeChatwootAccountId(input: {
    chatwootAccountId: number
    id: number
  }): Promise<TenantProvisioningRun>
  storeClientAdminUserId(input: {
    clientAdminUserId: number
    id: number
  }): Promise<TenantProvisioningRun>
  storePortalInboxId(input: {
    chatwootPortalInboxId: number
    id: number
  }): Promise<TenantProvisioningRun>
  storeRuntimeServiceUserId(input: {
    id: number
    runtimeServiceUserId: number
  }): Promise<TenantProvisioningRun>
}

export function createTenantProvisioningRepository(
  db: AppDatabase,
): TenantProvisioningRepository {
  async function findBySlug(slug: string) {
    const [run] = await db
      .select()
      .from(tenantProvisioningRuns)
      .where(eq(tenantProvisioningRuns.slug, slug))
      .limit(1)

    return run ?? null
  }

  async function updateRun(
    id: number,
    values: Partial<typeof tenantProvisioningRuns.$inferInsert>,
  ) {
    const [run] = await db
      .update(tenantProvisioningRuns)
      .set({
        ...values,
        updatedAt: new Date(),
      })
      .where(eq(tenantProvisioningRuns.id, id))
      .returning()

    if (!run) {
      throw new Error('Failed to update tenant provisioning run.')
    }

    return run
  }

  async function storeImmutableExternalId({
    fieldName,
    id,
    value,
  }: {
    fieldName:
      | 'adminVerificationServiceUserId'
      | 'chatwootAccountId'
      | 'chatwootPortalInboxId'
      | 'clientAdminUserId'
      | 'runtimeServiceUserId'
    id: number
    value: number
  }) {
    const normalizedValue = normalizePositiveInteger(value, fieldName)
    const column = tenantProvisioningRuns[fieldName]
    const [existingRun] = await db
      .update(tenantProvisioningRuns)
      .set({
        [fieldName]: normalizedValue,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tenantProvisioningRuns.id, id),
          or(isNull(column), eq(column, normalizedValue)),
        ),
      )
      .returning()

    if (existingRun) {
      return existingRun
    }

    const [currentRun] = await db
      .select()
      .from(tenantProvisioningRuns)
      .where(eq(tenantProvisioningRuns.id, id))
      .limit(1)

    if (!currentRun) {
      throw new Error('Failed to update tenant provisioning run.')
    }

    throw new TenantProvisioningConflictError(fieldName)
  }

  return {
    async createOrResumeRun(input: TenantProvisioningInput) {
      const normalizedSlug = normalizeSlug(input.slug)
      const existingRun = await findBySlug(normalizedSlug)

      if (existingRun) {
        const normalizedInput = normalizeForComparison(input)
        assertImmutableFieldsMatch(existingRun, normalizedInput)

        return existingRun
      }

      const normalizedInput = normalizeNewRunInput(input)
      const [createdRun] = await db
        .insert(tenantProvisioningRuns)
        .values(normalizedInput)
        .onConflictDoNothing({
          target: tenantProvisioningRuns.slug,
        })
        .returning()

      if (createdRun) {
        return createdRun
      }

      const racedRun = await findBySlug(normalizedInput.slug)

      if (!racedRun) {
        throw new Error('Failed to create tenant provisioning run.')
      }

      assertImmutableFieldsMatch(racedRun, normalizedInput)

      return racedRun
    },

    async listCompletedRuns() {
      return db
        .select()
        .from(tenantProvisioningRuns)
        .where(eq(tenantProvisioningRuns.status, 'completed'))
        .orderBy(sql`${tenantProvisioningRuns.slug} asc`)
    },

    async markCompleted({ id }: { id: number }) {
      return updateRun(id, {
        completedAt: new Date(),
        lastError: null,
        status: 'completed',
      })
    },

    async markFailed({ id, message }: { id: number; message: string }) {
      return updateRun(id, {
        lastError: normalizeNonEmptyString(message, 'message'),
        status: 'failed',
      })
    },

    async markStatus({
      id,
      status,
    }: {
      id: number
      status: ProvisioningStatus
    }) {
      if (terminalProvisioningStatuses.has(status)) {
        throw new TenantValidationError(
          'Use terminal provisioning helpers for final statuses.',
        )
      }

      return updateRun(id, {
        status: normalizeProvisioningStatus(status),
      })
    },

    async storeAdminVerificationServiceUserId({
      adminVerificationServiceUserId,
      id,
    }: {
      adminVerificationServiceUserId: number
      id: number
    }) {
      return storeImmutableExternalId({
        fieldName: 'adminVerificationServiceUserId',
        id,
        value: adminVerificationServiceUserId,
      })
    },

    async storeChatwootAccountId({
      chatwootAccountId,
      id,
    }: {
      chatwootAccountId: number
      id: number
    }) {
      return storeImmutableExternalId({
        fieldName: 'chatwootAccountId',
        id,
        value: chatwootAccountId,
      })
    },

    async storeClientAdminUserId({
      clientAdminUserId,
      id,
    }: {
      clientAdminUserId: number
      id: number
    }) {
      return storeImmutableExternalId({
        fieldName: 'clientAdminUserId',
        id,
        value: clientAdminUserId,
      })
    },

    async storePortalInboxId({
      chatwootPortalInboxId,
      id,
    }: {
      chatwootPortalInboxId: number
      id: number
    }) {
      return storeImmutableExternalId({
        fieldName: 'chatwootPortalInboxId',
        id,
        value: chatwootPortalInboxId,
      })
    },

    async storeRuntimeServiceUserId({
      id,
      runtimeServiceUserId,
    }: {
      id: number
      runtimeServiceUserId: number
    }) {
      return storeImmutableExternalId({
        fieldName: 'runtimeServiceUserId',
        id,
        value: runtimeServiceUserId,
      })
    },
  }
}
