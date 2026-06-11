import type {
  ChatwootPlatformAccount,
  ChatwootPlatformClient,
} from '../../integrations/chatwoot/platformClient.js'
import type { TenantProvisioningRun } from '../../db/schema.js'
import {
  TenantValidationError,
  type TenantsRepository,
} from '../tenants/repository.js'
import type { NormalizedTenantProvisioningInput } from './input.js'
import type { ProvisionTenantResult } from './service.js'
import type { TenantProvisioningRepository } from './repository.js'

type ActiveTenant = Awaited<ReturnType<TenantsRepository['createTenant']>>

const sensitiveErrorPattern = /token|secret|password|ciphertext/i

export function createDefaultPassword() {
  return crypto.randomUUID().replace(/-/g, '')
}

export function sanitizeProvisioningError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const trimmedMessage = message.trim() || 'Tenant provisioning failed.'

  return sensitiveErrorPattern.test(trimmedMessage)
    ? '[redacted]'
    : trimmedMessage
}

export function hasRunProgress(run: TenantProvisioningRun) {
  return (
    run.status !== 'pending' ||
    run.chatwootAccountId !== null ||
    run.clientAdminUserId !== null ||
    run.runtimeServiceUserId !== null ||
    run.adminVerificationServiceUserId !== null ||
    run.chatwootPortalInboxId !== null
  )
}

export function toResultTenant(
  tenant: ActiveTenant,
): ProvisionTenantResult['tenant'] {
  if (tenant.status !== 'active') {
    throw new TenantValidationError('Provisioned tenant must be active.')
  }

  return {
    chatwootAccountId: tenant.chatwootAccountId,
    chatwootPortalInboxId: tenant.chatwootPortalInboxId,
    id: tenant.id,
    primaryDomain: tenant.primaryDomain,
    publicBaseUrl: tenant.publicBaseUrl,
    slug: tenant.slug,
    status: tenant.status,
  }
}

export function assertExistingTenantMatchesInput({
  existingTenant,
  input,
}: {
  existingTenant: ActiveTenant
  input: NormalizedTenantProvisioningInput
}) {
  if (
    existingTenant.slug !== input.slug ||
    existingTenant.primaryDomain !== input.primaryDomain ||
    existingTenant.publicBaseUrl !== input.publicBaseUrl ||
    existingTenant.chatwootBaseUrl !== input.chatwootBaseUrl
  ) {
    throw new TenantValidationError(
      'Existing tenant does not match requested provisioning input.',
    )
  }
}

export function assertExistingTenantCanResume(existingTenant: ActiveTenant) {
  if (existingTenant.status !== 'provisioning') {
    throw new TenantValidationError(
      'Existing tenant does not match requested provisioning input.',
    )
  }
}

export async function findExistingPortalTenant({
  input,
  tenantsRepository,
}: {
  input: NormalizedTenantProvisioningInput
  tenantsRepository: TenantsRepository
}) {
  const [tenantBySlug, tenantByDomain] = await Promise.all([
    tenantsRepository.findBySlug(input.slug),
    tenantsRepository.findByPrimaryDomain(input.primaryDomain),
  ])

  if (tenantBySlug && tenantByDomain && tenantBySlug.id !== tenantByDomain.id) {
    throw new TenantValidationError(
      'Requested tenant slug and primary domain belong to different tenants.',
    )
  }

  return tenantBySlug ?? tenantByDomain
}

function findManagedAccountBySlug({
  accounts,
  slug,
}: {
  accounts: ChatwootPlatformAccount[]
  slug: string
}) {
  return (
    accounts.find(
      (account) =>
        account.customAttributes.portal_managed === true &&
        account.customAttributes.portal_tenant_slug === slug,
    ) ?? null
  )
}

export async function resolveChatwootAccount({
  input,
  platformClient,
  provisioningRepository,
  run,
}: {
  input: NormalizedTenantProvisioningInput
  platformClient: ChatwootPlatformClient
  provisioningRepository: TenantProvisioningRepository
  run: TenantProvisioningRun
}) {
  if (run.chatwootAccountId) {
    await platformClient.getAccount(run.chatwootAccountId)
    return run
  }

  const existingAccount = findManagedAccountBySlug({
    accounts: await platformClient.listAccounts(),
    slug: input.slug,
  })
  const account =
    existingAccount ??
    (await platformClient.createAccount({
      customAttributes: {
        portal_managed: true,
        portal_tenant_slug: input.slug,
      },
      name: input.displayName,
    }))

  return provisioningRepository.storeChatwootAccountId({
    chatwootAccountId: account.id,
    id: run.id,
  })
}

export async function resolveUserId({
  createUserInput,
  existingUserId,
  platformClient,
  provisioningRepository,
  runId,
  store,
}: {
  createUserInput: Parameters<ChatwootPlatformClient['createUser']>[0]
  existingUserId: number | null
  platformClient: ChatwootPlatformClient
  provisioningRepository: TenantProvisioningRepository
  runId: number
  store: (
    repository: TenantProvisioningRepository,
    input: { id: number; userId: number },
  ) => Promise<TenantProvisioningRun>
}) {
  if (existingUserId) {
    return {
      run: null,
      userId: existingUserId,
    }
  }

  const user = await platformClient.createUser(createUserInput)
  const run = await store(provisioningRepository, {
    id: runId,
    userId: user.id,
  })

  return {
    run,
    userId: user.id,
  }
}

export function requireProvisionedId(value: number | null, fieldName: string) {
  if (!value) {
    throw new Error(`Tenant provisioning did not store ${fieldName}.`)
  }

  return value
}

export function requireSecret(value: string | null, fieldName: string) {
  if (!value) {
    throw new Error(`${fieldName} is required.`)
  }

  return value
}
