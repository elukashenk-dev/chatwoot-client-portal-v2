import type { ChatwootPlatformClient } from '../../integrations/chatwoot/platformClient.js'
import type { TenantStatus, TenantsRepository } from '../tenants/repository.js'
import { tenantStatuses } from '../tenants/repository.js'

export type DeprovisionTenantResult = {
  chatwootDeleteRequested: boolean
  finalStatus: 'archived'
  previousStatus: TenantStatus
  tenantId: number
  tenantSlug: string
}

type DeprovisionTenantOptions = {
  confirmSlug: string
  deleteChatwootAccount: boolean
  platformClient: ChatwootPlatformClient
  tenantSlug: string
  tenantsRepository: Pick<
    TenantsRepository,
    'findBySlug' | 'updateTenantStatus'
  >
}

function readTenantStatus(status: string): TenantStatus {
  if (tenantStatuses.includes(status as TenantStatus)) {
    return status as TenantStatus
  }

  throw new Error('Tenant status is not supported.')
}

export async function deprovisionTenant({
  confirmSlug,
  deleteChatwootAccount,
  platformClient,
  tenantSlug,
  tenantsRepository,
}: DeprovisionTenantOptions): Promise<DeprovisionTenantResult> {
  const normalizedTenantSlug = tenantSlug.trim().toLowerCase()
  const normalizedConfirmSlug = confirmSlug.trim().toLowerCase()

  if (!normalizedTenantSlug) {
    throw new Error('Tenant slug is required.')
  }

  if (normalizedConfirmSlug !== normalizedTenantSlug) {
    throw new Error('Confirmation slug must match tenant slug.')
  }

  const tenant = await tenantsRepository.findBySlug(normalizedTenantSlug)

  if (!tenant) {
    throw new Error('Tenant was not found.')
  }
  const previousStatus = readTenantStatus(tenant.status)

  if (deleteChatwootAccount) {
    await tenantsRepository.updateTenantStatus({
      status: 'suspended',
      tenantId: tenant.id,
    })
    await platformClient.deleteAccount(tenant.chatwootAccountId)
  }

  await tenantsRepository.updateTenantStatus({
    status: 'archived',
    tenantId: tenant.id,
  })

  return {
    chatwootDeleteRequested: deleteChatwootAccount,
    finalStatus: 'archived',
    previousStatus,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
  }
}
