import type { TenantsRepository } from './repository.js'
import type { ChatwootClientConfig } from '../../integrations/chatwoot/client.js'
import { ApiError } from '../../lib/errors.js'
import {
  decodeTenantSecretKey,
  decryptTenantSecret,
  TenantSecretCiphertextError,
  TenantSecretKeyError,
} from './secrets.js'

export type TenantRequestContext = {
  chatwoot: ChatwootClientConfig & {
    webhookSecret: string
  }
  displayName: string
  id: number
  isDefault: boolean
  primaryDomain: string
  publicBaseUrl: string
  slug: string
  status: string
}

type CreateTenantsServiceOptions = {
  defaultTenantSlug?: string | undefined
  tenantSecretKey?: string | undefined
  tenantsRepository: Pick<
    TenantsRepository,
    'findByPrimaryDomain' | 'findBySlug'
  >
}

type ResolveTenantByHostOptions = {
  host: string
}

const defaultTenantSlug = 'default'
const hostPattern =
  /^(?:localhost|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*)$/

export class TenantHostValidationError extends Error {
  constructor(message: string) {
    super(message)

    this.name = 'TenantHostValidationError'
  }
}

function stripHostPort(host: string) {
  return host.replace(/:\d+$/, '')
}

export function normalizeTenantHost(rawHost: string) {
  const host = stripHostPort(rawHost.trim().toLowerCase().replace(/\.$/, ''))

  if (
    !host ||
    host.includes('://') ||
    host.includes('/') ||
    host.includes('?') ||
    host.includes('#') ||
    host.includes(':') ||
    /\s/.test(host) ||
    !hostPattern.test(host)
  ) {
    throw new TenantHostValidationError(
      'Tenant host must be a valid hostname without protocol or path.',
    )
  }

  return host
}

function toTenantRequestContext({
  defaultSlug,
  tenantSecretKey,
  tenant,
}: {
  defaultSlug: string
  tenantSecretKey: Buffer
  tenant: NonNullable<
    Awaited<ReturnType<TenantsRepository['findByPrimaryDomain']>>
  >
}): TenantRequestContext {
  return {
    chatwoot: {
      accountId: tenant.chatwootAccountId,
      apiAccessToken: decryptTenantSecret(
        tenant.chatwootApiAccessTokenCiphertext,
        tenantSecretKey,
      ),
      baseUrl: tenant.chatwootBaseUrl,
      portalInboxId: tenant.chatwootPortalInboxId,
      webhookSecret: decryptTenantSecret(
        tenant.chatwootWebhookSecretCiphertext,
        tenantSecretKey,
      ),
    },
    displayName: tenant.displayName,
    id: tenant.id,
    isDefault: tenant.slug === defaultSlug,
    primaryDomain: tenant.primaryDomain,
    publicBaseUrl: tenant.publicBaseUrl,
    slug: tenant.slug,
    status: tenant.status,
  }
}

export function createTenantsService({
  defaultTenantSlug: configuredDefaultTenantSlug,
  tenantSecretKey: rawTenantSecretKey,
  tenantsRepository,
}: CreateTenantsServiceOptions) {
  const normalizedDefaultTenantSlug = (
    configuredDefaultTenantSlug || defaultTenantSlug
  )
    .trim()
    .toLowerCase()

  function resolveTenantSecretKey() {
    if (!rawTenantSecretKey?.trim()) {
      throw new ApiError(
        500,
        'TENANT_SECRET_KEY_MISSING',
        'Tenant secret key is not configured.',
      )
    }

    try {
      return decodeTenantSecretKey(rawTenantSecretKey)
    } catch (error) {
      if (error instanceof TenantSecretKeyError) {
        throw new ApiError(
          500,
          'TENANT_SECRET_KEY_INVALID',
          'Tenant secret key is invalid.',
        )
      }

      throw error
    }
  }

  function buildTenantRequestContext(
    tenant: NonNullable<
      Awaited<ReturnType<TenantsRepository['findByPrimaryDomain']>>
    >,
  ) {
    try {
      return toTenantRequestContext({
        defaultSlug: normalizedDefaultTenantSlug,
        tenant,
        tenantSecretKey: resolveTenantSecretKey(),
      })
    } catch (error) {
      if (error instanceof TenantSecretCiphertextError) {
        throw new ApiError(
          500,
          'TENANT_SECRET_CIPHERTEXT_INVALID',
          'Tenant secret ciphertext is invalid.',
        )
      }

      throw error
    }
  }

  return {
    assertDefaultTenantRuntime(tenant: TenantRequestContext) {
      if (!tenant.isDefault) {
        throw new ApiError(
          503,
          'TENANT_RUNTIME_NOT_READY',
          'Личный кабинет для этого tenant пока не включен.',
        )
      }
    },

    getPublicTenantContext(tenant: TenantRequestContext) {
      return {
        displayName: tenant.displayName,
        primaryDomain: tenant.primaryDomain,
        publicBaseUrl: tenant.publicBaseUrl,
        slug: tenant.slug,
      }
    },

    async resolveTenantByHost({ host }: ResolveTenantByHostOptions) {
      let normalizedHost: string

      try {
        normalizedHost = normalizeTenantHost(host)
      } catch {
        throw new ApiError(
          400,
          'TENANT_HOST_INVALID',
          'Некорректный host личного кабинета.',
        )
      }

      const tenant = await tenantsRepository.findByPrimaryDomain(normalizedHost)

      if (!tenant) {
        throw new ApiError(
          404,
          'TENANT_NOT_FOUND',
          'Личный кабинет для этого домена не найден.',
        )
      }

      return buildTenantRequestContext(tenant)
    },

    async resolveDefaultTenant() {
      const tenant = await tenantsRepository.findBySlug(
        normalizedDefaultTenantSlug,
      )

      if (!tenant) {
        return null
      }

      return buildTenantRequestContext(tenant)
    },
  }
}

export type TenantsService = ReturnType<typeof createTenantsService>
