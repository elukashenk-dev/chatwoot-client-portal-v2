import type {
  ChatwootAdminAgent,
  ChatwootAdminAgentsClientConfig,
} from '../../integrations/chatwoot/adminAgents.js'
import { ChatwootClientRequestError } from '../../integrations/chatwoot/errors.js'
import { normalizeEmail } from '../../lib/email.js'
import type { TenantsRepository } from '../tenants/repository.js'
import {
  decodeTenantSecretKey,
  decryptTenantSecret,
  TenantSecretCiphertextError,
  TenantSecretKeyError,
} from '../tenants/secrets.js'

type TenantAdminAgentsClient = {
  listAccountAgents: () => Promise<ChatwootAdminAgent[]>
}

type TenantAdminAgentsClientFactory = {
  forTenant: (
    config: ChatwootAdminAgentsClientConfig,
  ) => TenantAdminAgentsClient
}

type CreateTenantAdminVerificationServiceOptions = {
  chatwootAdminAgentsClientFactory: TenantAdminAgentsClientFactory
  tenantSecretKey: string
  tenantsRepository: Pick<
    TenantsRepository,
    'findAdminVerificationConfigByTenantId'
  >
}

export type TenantAdminVerificationResult =
  | {
      agent: {
        accountId: number
        email: string
        id: number
        role: string
      }
      result: 'eligible'
    }
  | {
      result:
        | 'chatwoot_permission_denied'
        | 'invalid_token_secret'
        | 'not_configured'
        | 'not_eligible'
        | 'tenant_not_found'
        | 'tenant_not_active'
    }

function isEligibleAdminAgent({
  agent,
  chatwootAccountId,
  email,
}: {
  agent: ChatwootAdminAgent
  chatwootAccountId: number
  email: string
}) {
  return (
    agent.accountId === chatwootAccountId &&
    agent.confirmed &&
    agent.email === email &&
    agent.role === 'administrator'
  )
}

export function createTenantAdminVerificationService({
  chatwootAdminAgentsClientFactory,
  tenantSecretKey,
  tenantsRepository,
}: CreateTenantAdminVerificationServiceOptions) {
  return {
    async verifyTenantAdminEmail({
      email,
      tenantId,
    }: {
      email: string
      tenantId: number
    }): Promise<TenantAdminVerificationResult> {
      const tenant =
        await tenantsRepository.findAdminVerificationConfigByTenantId(tenantId)

      if (!tenant) {
        return { result: 'tenant_not_found' }
      }

      if (tenant.status !== 'active') {
        return { result: 'tenant_not_active' }
      }

      if (!tenant.chatwootAdminVerificationTokenCiphertext) {
        return { result: 'not_configured' }
      }

      let apiAccessToken: string

      try {
        apiAccessToken = decryptTenantSecret(
          tenant.chatwootAdminVerificationTokenCiphertext,
          decodeTenantSecretKey(tenantSecretKey),
        )
      } catch (error) {
        if (
          error instanceof TenantSecretCiphertextError ||
          error instanceof TenantSecretKeyError
        ) {
          return { result: 'invalid_token_secret' }
        }

        throw error
      }

      let agents: ChatwootAdminAgent[]

      try {
        agents = await chatwootAdminAgentsClientFactory
          .forTenant({
            accountId: tenant.chatwootAccountId,
            apiAccessToken,
            baseUrl: tenant.chatwootBaseUrl,
          })
          .listAccountAgents()
      } catch (error) {
        if (error instanceof ChatwootClientRequestError) {
          return { result: 'chatwoot_permission_denied' }
        }

        throw error
      }

      const normalizedEmail = normalizeEmail(email)
      const agent =
        agents.find((candidate) =>
          isEligibleAdminAgent({
            agent: candidate,
            chatwootAccountId: tenant.chatwootAccountId,
            email: normalizedEmail,
          }),
        ) ?? null

      if (!agent) {
        return { result: 'not_eligible' }
      }

      return {
        agent: {
          accountId: agent.accountId,
          email: agent.email,
          id: agent.id,
          role: agent.role,
        },
        result: 'eligible',
      }
    },
  }
}

export type TenantAdminVerificationService = ReturnType<
  typeof createTenantAdminVerificationService
>
