import {
  portalAdminAuditEvents,
  portalAdminLoginChallenges,
} from '../../db/schema.js'

export function baseChallengeSelection() {
  return {
    attemptsCount: portalAdminLoginChallenges.attemptsCount,
    chatwootAgentId: portalAdminLoginChallenges.chatwootAgentId,
    codeHash: portalAdminLoginChallenges.codeHash,
    email: portalAdminLoginChallenges.email,
    expiresAt: portalAdminLoginChallenges.expiresAt,
    id: portalAdminLoginChallenges.id,
    lastSentAt: portalAdminLoginChallenges.lastSentAt,
    maxAttempts: portalAdminLoginChallenges.maxAttempts,
    resendCount: portalAdminLoginChallenges.resendCount,
    resendNotBefore: portalAdminLoginChallenges.resendNotBefore,
    role: portalAdminLoginChallenges.role,
    status: portalAdminLoginChallenges.status,
    verifiedAt: portalAdminLoginChallenges.verifiedAt,
  }
}

export function baseAuditEventSelection() {
  return {
    action: portalAdminAuditEvents.action,
    actorChatwootAgentId: portalAdminAuditEvents.actorChatwootAgentId,
    actorEmail: portalAdminAuditEvents.actorEmail,
    createdAt: portalAdminAuditEvents.createdAt,
    id: portalAdminAuditEvents.id,
    metadata: portalAdminAuditEvents.metadata,
    outcome: portalAdminAuditEvents.outcome,
    requestIp: portalAdminAuditEvents.requestIp,
    subjectEmail: portalAdminAuditEvents.subjectEmail,
    tenantId: portalAdminAuditEvents.tenantId,
    userAgent: portalAdminAuditEvents.userAgent,
  }
}
