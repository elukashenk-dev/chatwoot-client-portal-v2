import { ChatwootClientRequestError } from '../../integrations/chatwoot/errors.js'
import type { ChatwootPlatformClient } from '../../integrations/chatwoot/platformClient.js'
import type { TenantsRepository } from '../tenants/repository.js'
import type { TenantProvisioningRepository } from './repository.js'

export type ReconcileTenantChatwootAccountsResult = {
  checked: number
  dryRun: boolean
  suspended: number
  tenants: Array<{
    action: 'kept_active' | 'skipped' | 'suspended' | 'would_suspend'
    reason:
      | 'archived'
      | 'chatwoot_account_missing'
      | 'chatwoot_account_reachable'
      | 'not_operator_provisioned'
      | 'platform_auth_failed'
      | 'provisioning'
    slug: string
  }>
}

type ReconcileTenantChatwootAccountsOptions = {
  dryRun: boolean
  platformClientFactory: (baseUrl: string) => ChatwootPlatformClient
  provisioningRepository: Pick<
    TenantProvisioningRepository,
    'listCompletedRuns'
  >
  tenantsRepository: Pick<
    TenantsRepository,
    'listTenants' | 'updateTenantStatus'
  >
}

function isChatwootStatusError(error: unknown, status: 401 | 404) {
  return (
    error instanceof ChatwootClientRequestError &&
    error.message.includes(`Status: ${status}.`)
  )
}

export async function reconcileTenantChatwootAccounts({
  dryRun,
  platformClientFactory,
  provisioningRepository,
  tenantsRepository,
}: ReconcileTenantChatwootAccountsOptions): Promise<ReconcileTenantChatwootAccountsResult> {
  const completedRuns = await provisioningRepository.listCompletedRuns()
  const completedRunSlugs = new Set(completedRuns.map((run) => run.slug))
  const tenants = await tenantsRepository.listTenants()
  const reports: ReconcileTenantChatwootAccountsResult['tenants'] = []
  let suspended = 0

  for (const tenant of tenants) {
    if (!completedRunSlugs.has(tenant.slug)) {
      reports.push({
        action: 'skipped',
        reason: 'not_operator_provisioned',
        slug: tenant.slug,
      })
      continue
    }

    if (tenant.status === 'archived') {
      reports.push({
        action: 'skipped',
        reason: 'archived',
        slug: tenant.slug,
      })
      continue
    }

    if (tenant.status !== 'active') {
      reports.push({
        action: 'skipped',
        reason: 'provisioning',
        slug: tenant.slug,
      })
      continue
    }

    try {
      await platformClientFactory(tenant.chatwootBaseUrl).getAccount(
        tenant.chatwootAccountId,
      )
      reports.push({
        action: 'kept_active',
        reason: 'chatwoot_account_reachable',
        slug: tenant.slug,
      })
    } catch (error) {
      if (isChatwootStatusError(error, 401)) {
        reports.push({
          action: 'skipped',
          reason: 'platform_auth_failed',
          slug: tenant.slug,
        })
        continue
      }

      if (!isChatwootStatusError(error, 404)) {
        throw error
      }

      if (dryRun) {
        reports.push({
          action: 'would_suspend',
          reason: 'chatwoot_account_missing',
          slug: tenant.slug,
        })
        continue
      }

      await tenantsRepository.updateTenantStatus({
        status: 'suspended',
        tenantId: tenant.id,
      })
      suspended += 1
      reports.push({
        action: 'suspended',
        reason: 'chatwoot_account_missing',
        slug: tenant.slug,
      })
    }
  }

  return {
    checked: tenants.length,
    dryRun,
    suspended,
    tenants: reports,
  }
}
