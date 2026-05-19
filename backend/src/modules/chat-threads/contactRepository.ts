import { and, eq } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import { portalUserContactLinks, portalUsers } from '../../db/schema.js'

type ContactLinkInput = {
  chatwootContactId: number
  userId: number
}

type TenantRepositoryScope = {
  tenantId: number
}

export function createChatThreadContactRepository(
  db: AppDatabase,
  { tenantId }: TenantRepositoryScope,
) {
  async function findContactLinkByUserId(userId: number) {
    const [link] = await db
      .select({
        chatwootContactId: portalUserContactLinks.chatwootContactId,
        userId: portalUserContactLinks.userId,
      })
      .from(portalUserContactLinks)
      .where(
        and(
          eq(portalUserContactLinks.tenantId, tenantId),
          eq(portalUserContactLinks.userId, userId),
        ),
      )
      .limit(1)

    return link ?? null
  }

  return {
    async createContactLink({ chatwootContactId, userId }: ContactLinkInput) {
      const [link] = await db
        .insert(portalUserContactLinks)
        .values({
          chatwootContactId,
          tenantId,
          userId,
        })
        .onConflictDoNothing()
        .returning({
          chatwootContactId: portalUserContactLinks.chatwootContactId,
          userId: portalUserContactLinks.userId,
        })

      return link ?? findContactLinkByUserId(userId)
    },

    findContactLinkByUserId,

    async listActivePortalUserContactLinks() {
      return db
        .select({
          chatwootContactId: portalUserContactLinks.chatwootContactId,
          email: portalUsers.email,
          fullName: portalUsers.fullName,
          userId: portalUsers.id,
        })
        .from(portalUserContactLinks)
        .innerJoin(
          portalUsers,
          eq(portalUserContactLinks.userId, portalUsers.id),
        )
        .where(
          and(
            eq(portalUserContactLinks.tenantId, tenantId),
            eq(portalUsers.tenantId, tenantId),
            eq(portalUsers.isActive, true),
          ),
        )
    },

    async findPortalUserById(userId: number) {
      const [user] = await db
        .select({
          email: portalUsers.email,
          id: portalUsers.id,
        })
        .from(portalUsers)
        .where(
          and(eq(portalUsers.id, userId), eq(portalUsers.tenantId, tenantId)),
        )
        .limit(1)

      return user ?? null
    },
  }
}

export type ChatThreadContactRepository = ReturnType<
  typeof createChatThreadContactRepository
>
