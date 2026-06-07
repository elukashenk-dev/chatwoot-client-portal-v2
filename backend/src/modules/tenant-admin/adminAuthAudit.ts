import type { AppDatabase } from '../../db/client.js'
import type { PublicTenantAdmin } from './adminAuthPrimitives.js'
import type { TenantAdminAuthRepository } from './adminAuthRepository.js'

type RequestMetadata = {
  requestIp: string | null
  userAgent: string | null
}

type TenantAdminAuditInput = RequestMetadata & {
  action: string
  actor?: PublicTenantAdmin | null
  executor?: AppDatabase
  metadata?: Record<string, unknown>
  outcome: string
  subjectEmail?: string | null
}

export function createTenantAdminAuditLogger(
  repository: TenantAdminAuthRepository,
) {
  return async function audit({
    action,
    actor,
    executor,
    metadata,
    outcome,
    requestIp,
    subjectEmail,
    userAgent,
  }: TenantAdminAuditInput) {
    await repository.createAuditEvent(
      {
        action,
        actorChatwootAgentId: actor?.chatwootAgentId ?? null,
        actorEmail: actor?.email ?? null,
        outcome,
        requestIp,
        userAgent,
        ...(metadata === undefined ? {} : { metadata }),
        ...(subjectEmail === undefined ? {} : { subjectEmail }),
      },
      executor,
    )
  }
}
