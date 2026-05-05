import type { TenantsRepository } from './repository.js'
import { ApiError } from '../../lib/errors.js'

export type TenantRequestContext = {
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
  tenant,
}: {
  defaultSlug: string
  tenant: NonNullable<
    Awaited<ReturnType<TenantsRepository['findByPrimaryDomain']>>
  >
}): TenantRequestContext {
  return {
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
  tenantsRepository,
}: CreateTenantsServiceOptions) {
  const normalizedDefaultTenantSlug = (
    configuredDefaultTenantSlug || defaultTenantSlug
  )
    .trim()
    .toLowerCase()

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

      return toTenantRequestContext({
        defaultSlug: normalizedDefaultTenantSlug,
        tenant,
      })
    },

    async resolveDefaultTenant() {
      const tenant = await tenantsRepository.findBySlug(
        normalizedDefaultTenantSlug,
      )

      if (!tenant) {
        return null
      }

      return toTenantRequestContext({
        defaultSlug: normalizedDefaultTenantSlug,
        tenant,
      })
    },
  }
}

export type TenantsService = ReturnType<typeof createTenantsService>
