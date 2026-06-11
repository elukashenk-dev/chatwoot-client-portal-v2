import { and, eq, isNull, or, sql } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import {
  tenantProvisioningRuns,
  type TenantProvisioningRun,
} from '../../db/schema.js'
import {
  assertImmutableFieldsMatch,
  normalizeForComparison,
  normalizeNewRunInput,
  normalizeNonTerminalProvisioningStatus,
  TenantProvisioningConflictError,
  type ProvisioningStatus,
  type TenantProvisioningInput,
} from './repositoryInput.js'
import {
  normalizeNonEmptyString,
  normalizePositiveInteger,
  normalizeSlug,
} from '../tenants/repository.js'

export {
  provisioningStatuses,
  tenantProvisioningDomainModes,
  TenantProvisioningConflictError,
  toSafeTenantProvisioningRunReport,
} from './repositoryInput.js'
export type {
  ProvisioningStatus,
  TenantProvisioningDomainMode,
  TenantProvisioningInput,
} from './repositoryInput.js'

export type TenantProvisioningRepository = {
  createOrResumeRun(
    input: TenantProvisioningInput,
  ): Promise<TenantProvisioningRun>
  listCompletedRuns(): Promise<TenantProvisioningRun[]>
  markCompleted(input: { id: number }): Promise<TenantProvisioningRun>
  markFailed(input: {
    id: number
    message: string
  }): Promise<TenantProvisioningRun>
  markStatus(input: {
    id: number
    status: ProvisioningStatus
  }): Promise<TenantProvisioningRun>
  storeAdminVerificationServiceUserId(input: {
    adminVerificationServiceUserId: number
    id: number
  }): Promise<TenantProvisioningRun>
  storeChatwootAccountId(input: {
    chatwootAccountId: number
    id: number
  }): Promise<TenantProvisioningRun>
  storeClientAdminUserId(input: {
    clientAdminUserId: number
    id: number
  }): Promise<TenantProvisioningRun>
  storePortalInboxId(input: {
    chatwootPortalInboxId: number
    id: number
  }): Promise<TenantProvisioningRun>
  storeRuntimeServiceUserId(input: {
    id: number
    runtimeServiceUserId: number
  }): Promise<TenantProvisioningRun>
}

export function createTenantProvisioningRepository(
  db: AppDatabase,
): TenantProvisioningRepository {
  async function findBySlug(slug: string) {
    const [run] = await db
      .select()
      .from(tenantProvisioningRuns)
      .where(eq(tenantProvisioningRuns.slug, slug))
      .limit(1)

    return run ?? null
  }

  async function updateRun(
    id: number,
    values: Partial<typeof tenantProvisioningRuns.$inferInsert>,
  ) {
    const [run] = await db
      .update(tenantProvisioningRuns)
      .set({
        ...values,
        updatedAt: new Date(),
      })
      .where(eq(tenantProvisioningRuns.id, id))
      .returning()

    if (!run) {
      throw new Error('Failed to update tenant provisioning run.')
    }

    return run
  }

  async function storeImmutableExternalId({
    fieldName,
    id,
    value,
  }: {
    fieldName:
      | 'adminVerificationServiceUserId'
      | 'chatwootAccountId'
      | 'chatwootPortalInboxId'
      | 'clientAdminUserId'
      | 'runtimeServiceUserId'
    id: number
    value: number
  }) {
    const normalizedValue = normalizePositiveInteger(value, fieldName)
    const column = tenantProvisioningRuns[fieldName]
    const [existingRun] = await db
      .update(tenantProvisioningRuns)
      .set({
        [fieldName]: normalizedValue,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tenantProvisioningRuns.id, id),
          or(isNull(column), eq(column, normalizedValue)),
        ),
      )
      .returning()

    if (existingRun) {
      return existingRun
    }

    const [currentRun] = await db
      .select()
      .from(tenantProvisioningRuns)
      .where(eq(tenantProvisioningRuns.id, id))
      .limit(1)

    if (!currentRun) {
      throw new Error('Failed to update tenant provisioning run.')
    }

    throw new TenantProvisioningConflictError(fieldName)
  }

  return {
    async createOrResumeRun(input: TenantProvisioningInput) {
      const normalizedSlug = normalizeSlug(input.slug)
      const existingRun = await findBySlug(normalizedSlug)

      if (existingRun) {
        const normalizedInput = normalizeForComparison(input)
        assertImmutableFieldsMatch(existingRun, normalizedInput)

        return existingRun
      }

      const normalizedInput = normalizeNewRunInput(input)
      const [createdRun] = await db
        .insert(tenantProvisioningRuns)
        .values(normalizedInput)
        .onConflictDoNothing({
          target: tenantProvisioningRuns.slug,
        })
        .returning()

      if (createdRun) {
        return createdRun
      }

      const racedRun = await findBySlug(normalizedInput.slug)

      if (!racedRun) {
        throw new Error('Failed to create tenant provisioning run.')
      }

      assertImmutableFieldsMatch(racedRun, normalizedInput)

      return racedRun
    },

    async listCompletedRuns() {
      return db
        .select()
        .from(tenantProvisioningRuns)
        .where(eq(tenantProvisioningRuns.status, 'completed'))
        .orderBy(sql`${tenantProvisioningRuns.slug} asc`)
    },

    async markCompleted({ id }: { id: number }) {
      return updateRun(id, {
        completedAt: new Date(),
        lastError: null,
        status: 'completed',
      })
    },

    async markFailed({ id, message }: { id: number; message: string }) {
      return updateRun(id, {
        lastError: normalizeNonEmptyString(message, 'message'),
        status: 'failed',
      })
    },

    async markStatus({
      id,
      status,
    }: {
      id: number
      status: ProvisioningStatus
    }) {
      return updateRun(id, {
        status: normalizeNonTerminalProvisioningStatus(status),
      })
    },

    async storeAdminVerificationServiceUserId({
      adminVerificationServiceUserId,
      id,
    }: {
      adminVerificationServiceUserId: number
      id: number
    }) {
      return storeImmutableExternalId({
        fieldName: 'adminVerificationServiceUserId',
        id,
        value: adminVerificationServiceUserId,
      })
    },

    async storeChatwootAccountId({
      chatwootAccountId,
      id,
    }: {
      chatwootAccountId: number
      id: number
    }) {
      return storeImmutableExternalId({
        fieldName: 'chatwootAccountId',
        id,
        value: chatwootAccountId,
      })
    },

    async storeClientAdminUserId({
      clientAdminUserId,
      id,
    }: {
      clientAdminUserId: number
      id: number
    }) {
      return storeImmutableExternalId({
        fieldName: 'clientAdminUserId',
        id,
        value: clientAdminUserId,
      })
    },

    async storePortalInboxId({
      chatwootPortalInboxId,
      id,
    }: {
      chatwootPortalInboxId: number
      id: number
    }) {
      return storeImmutableExternalId({
        fieldName: 'chatwootPortalInboxId',
        id,
        value: chatwootPortalInboxId,
      })
    },

    async storeRuntimeServiceUserId({
      id,
      runtimeServiceUserId,
    }: {
      id: number
      runtimeServiceUserId: number
    }) {
      return storeImmutableExternalId({
        fieldName: 'runtimeServiceUserId',
        id,
        value: runtimeServiceUserId,
      })
    },
  }
}
