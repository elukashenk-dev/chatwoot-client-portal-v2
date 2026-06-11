import type { TenantProvisioningRun } from '../../db/schema.js'
import { normalizeEmail } from '../../lib/email.js'
import {
  normalizeDomain,
  normalizeNonEmptyString,
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

export type NormalizedTenantProvisioningInput = {
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

export function normalizeNonTerminalProvisioningStatus(
  status: ProvisioningStatus,
) {
  if (terminalProvisioningStatuses.has(status)) {
    throw new TenantValidationError(
      'Use terminal provisioning helpers for final statuses.',
    )
  }

  return normalizeProvisioningStatus(status)
}

export function normalizeForComparison(
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

export function normalizeNewRunInput(
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

export function assertImmutableFieldsMatch(
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
