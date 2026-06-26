import { sql } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import { portalUsers } from '../../db/schema.js'
import { normalizeEmail } from '../../lib/email.js'

export class PortalUserConflictError extends Error {
  constructor(message = 'Portal user with this email already exists.') {
    super(message)

    this.name = 'PortalUserConflictError'
  }
}

type CreatePortalUserInput = {
  email: string
  fullName?: string | null
  isActive?: boolean
  passwordHash: string | null
  tenantId: number
}

type TenantEmailScope = {
  email: string
  tenantId: number
}

export function createPortalUsersRepository(db: AppDatabase) {
  return {
    async create({
      email,
      fullName,
      isActive = true,
      passwordHash,
      tenantId,
    }: CreatePortalUserInput) {
      const normalizedEmail = normalizeEmail(email)
      const normalizedFullName = fullName?.trim() ? fullName.trim() : null

      const existingUser = await this.findByEmail({
        email: normalizedEmail,
        tenantId,
      })

      if (existingUser) {
        throw new PortalUserConflictError()
      }

      const [createdUser] = await db
        .insert(portalUsers)
        .values({
          email: normalizedEmail,
          fullName: normalizedFullName,
          isActive,
          passwordHash,
          tenantId,
        })
        .returning({
          email: portalUsers.email,
          fullName: portalUsers.fullName,
          id: portalUsers.id,
          isActive: portalUsers.isActive,
          tenantId: portalUsers.tenantId,
        })

      return createdUser
    },

    async findByEmail({ email, tenantId }: TenantEmailScope) {
      const normalizedEmail = normalizeEmail(email)

      const [user] = await db
        .select({
          email: portalUsers.email,
          fullName: portalUsers.fullName,
          id: portalUsers.id,
          isActive: portalUsers.isActive,
          passwordHash: portalUsers.passwordHash,
          tenantId: portalUsers.tenantId,
        })
        .from(portalUsers)
        .where(
          sql`${portalUsers.tenantId} = ${tenantId} and lower(${portalUsers.email}) = ${normalizedEmail}`,
        )
        .limit(1)

      return user ?? null
    },
  }
}

export type PortalUsersRepository = ReturnType<
  typeof createPortalUsersRepository
>
