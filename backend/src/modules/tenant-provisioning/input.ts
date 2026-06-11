import { normalizeEmail } from '../../lib/email.js'
import {
  normalizeDomain,
  normalizeNonEmptyString,
  normalizeSlug,
  normalizeUrl,
  TenantValidationError,
} from '../tenants/repository.js'
import type { TenantProvisioningDomainMode } from './repository.js'

export type TenantProvisioningBaseInput = {
  chatwootBaseUrl: string
  clientAdminEmail: string
  clientAdminName: string
  displayName: string
  serviceEmailDomain: string
  slug: string
}

export type TenantProvisioningDomainInput =
  | {
      mode: 'custom_domain'
      primaryDomain: string
      publicBaseUrl: string
    }
  | {
      mode: 'provider_subdomain'
      providerSubdomain: string
      providerTenantDomainSuffix: string
    }

export type TenantProvisioningInput = TenantProvisioningBaseInput &
  TenantProvisioningDomainInput

export type NormalizedTenantProvisioningInput = TenantProvisioningBaseInput & {
  domainMode: TenantProvisioningDomainMode
  primaryDomain: string
  providerSubdomain: string | null
  providerTenantDomainSuffix: string | null
  publicBaseUrl: string
}

const providerSubdomainPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const reservedProviderSubdomains = new Set([
  'admin',
  'api',
  'www',
  'mail',
  'chat',
  'support',
])

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
  if (readUrlHostname(publicBaseUrl, 'publicBaseUrl') !== primaryDomain) {
    throw new TenantValidationError(
      'Tenant provisioning publicBaseUrl hostname must match primaryDomain.',
    )
  }
}

function normalizeServiceEmailDomain(value: string) {
  try {
    return normalizeDomain(value)
  } catch (error) {
    if (error instanceof TenantValidationError) {
      throw new TenantValidationError(
        'Tenant provisioning service email domain must be a domain.',
      )
    }

    throw error
  }
}

function normalizeProviderTenantDomainSuffix(value: string) {
  if (!value.trim()) {
    throw new TenantValidationError(
      'Provider tenant domain suffix is required.',
    )
  }

  const suffix = normalizeDomain(value)

  if (suffix.includes('*')) {
    throw new TenantValidationError(
      'Provider tenant domain suffix must not include wildcard labels.',
    )
  }

  return suffix
}

function normalizeProviderSubdomain({
  providerSubdomain,
  slug,
}: {
  providerSubdomain: string
  slug: string
}) {
  const normalizedProviderSubdomain = providerSubdomain.trim()

  if (!normalizedProviderSubdomain) {
    throw new TenantValidationError('Provider subdomain is required.')
  }

  if (normalizedProviderSubdomain !== slug) {
    throw new TenantValidationError(
      'Provider subdomain must match tenant slug.',
    )
  }

  if (
    !providerSubdomainPattern.test(normalizedProviderSubdomain) ||
    reservedProviderSubdomains.has(normalizedProviderSubdomain)
  ) {
    throw new TenantValidationError(
      'Provider subdomain must be a safe lowercase DNS label.',
    )
  }

  return normalizedProviderSubdomain
}

function normalizeBaseFields(input: TenantProvisioningInput) {
  return {
    chatwootBaseUrl: normalizeUrl(input.chatwootBaseUrl, 'chatwootBaseUrl'),
    clientAdminEmail: normalizeEmail(input.clientAdminEmail),
    clientAdminName: normalizeNonEmptyString(
      input.clientAdminName,
      'clientAdminName',
    ),
    displayName: normalizeNonEmptyString(input.displayName, 'displayName'),
    serviceEmailDomain: normalizeServiceEmailDomain(input.serviceEmailDomain),
    slug: normalizeSlug(input.slug),
  }
}

export function normalizeTenantProvisioningInput(
  input: TenantProvisioningInput,
): NormalizedTenantProvisioningInput {
  const baseInput = normalizeBaseFields(input)

  if (input.mode === 'custom_domain') {
    const primaryDomain = normalizeDomain(input.primaryDomain)
    const publicBaseUrl = normalizeUrl(input.publicBaseUrl, 'publicBaseUrl')

    assertPublicBaseUrlMatchesPrimaryDomain({
      primaryDomain,
      publicBaseUrl,
    })

    return {
      ...baseInput,
      domainMode: 'custom_domain',
      primaryDomain,
      providerSubdomain: null,
      providerTenantDomainSuffix: null,
      publicBaseUrl,
    }
  }

  const providerSubdomain = normalizeProviderSubdomain({
    providerSubdomain: input.providerSubdomain,
    slug: baseInput.slug,
  })
  const providerTenantDomainSuffix = normalizeProviderTenantDomainSuffix(
    input.providerTenantDomainSuffix,
  )
  const primaryDomain = `${providerSubdomain}.${providerTenantDomainSuffix}`

  return {
    ...baseInput,
    domainMode: 'provider_subdomain',
    primaryDomain,
    providerSubdomain,
    providerTenantDomainSuffix,
    publicBaseUrl: `https://${primaryDomain}`,
  }
}

export function buildProvisioningServiceUsers(input: {
  serviceEmailDomain: string
  slug: string
}) {
  const slug = normalizeSlug(input.slug)
  const serviceEmailDomain = normalizeServiceEmailDomain(
    input.serviceEmailDomain,
  )

  return {
    adminVerificationEmail: `portal-admin-verify+${slug}@${serviceEmailDomain}`,
    runtimeEmail: `portal-runtime+${slug}@${serviceEmailDomain}`,
  }
}
