import { and, eq, or, sql } from 'drizzle-orm'

import type { NodeAppDatabase } from '../db/client.js'
import {
  portalTenants,
  portalUsers,
  verificationRecords,
} from '../db/schema.js'
import { normalizeEmail } from '../lib/email.js'
import { hashPassword } from '../lib/password.js'

export const E2E_PORTAL_USER = {
  email: 'e2e.portal.user@example.test',
  fullName: 'E2E Portal User',
  password: 'PortalPass123!',
} as const

export function resolveE2eTenantLookupFromEnv() {
  const explicitSlug = process.env.E2E_TENANT_SLUG?.trim().toLowerCase()

  if (explicitSlug) {
    return {
      slug: explicitSlug,
    }
  }

  const baseUrl = process.env.PLAYWRIGHT_BASE_URL?.trim()

  if (baseUrl) {
    try {
      const hostname = new URL(baseUrl).hostname.trim().toLowerCase()

      if (hostname) {
        return {
          primaryDomain: hostname,
        }
      }
    } catch {
      throw new Error('PLAYWRIGHT_BASE_URL must be a valid URL.')
    }
  }

  const defaultPrimaryDomain =
    process.env.DEFAULT_TENANT_PRIMARY_DOMAIN?.trim().toLowerCase()

  if (defaultPrimaryDomain) {
    return {
      primaryDomain: defaultPrimaryDomain,
    }
  }

  return null
}

export async function findE2eTenantId(db: NodeAppDatabase) {
  const lookup = resolveE2eTenantLookupFromEnv()

  if (!lookup) {
    const [tenant] = await db
      .select({
        id: portalTenants.id,
      })
      .from(portalTenants)
      .orderBy(sql`${portalTenants.id} asc`)
      .limit(1)

    return tenant?.id ?? null
  }

  const [tenant] = await db
    .select({
      id: portalTenants.id,
    })
    .from(portalTenants)
    .where(
      or(
        'slug' in lookup ? eq(portalTenants.slug, lookup.slug) : undefined,
        'primaryDomain' in lookup
          ? eq(portalTenants.primaryDomain, lookup.primaryDomain)
          : undefined,
      ),
    )
    .limit(1)

  return tenant?.id ?? null
}

export async function seedE2ePortalUser(
  db: NodeAppDatabase,
  user = E2E_PORTAL_USER,
) {
  const now = new Date()
  const email = normalizeEmail(user.email)
  const passwordHash = await hashPassword(user.password)

  return db.transaction(async (transaction) => {
    const tenantId = await findE2eTenantId(transaction)

    if (!tenantId) {
      throw new Error('Seed a portal tenant before seeding e2e portal users.')
    }

    await transaction
      .delete(verificationRecords)
      .where(
        and(
          eq(verificationRecords.tenantId, tenantId),
          sql`lower(${verificationRecords.email}) = ${email}`,
        ),
      )
    await transaction
      .delete(portalUsers)
      .where(
        and(
          eq(portalUsers.tenantId, tenantId),
          sql`lower(${portalUsers.email}) = ${email}`,
        ),
      )

    const [createdUser] = await transaction
      .insert(portalUsers)
      .values({
        email,
        fullName: user.fullName,
        isActive: true,
        passwordHash,
        tenantId,
        updatedAt: now,
      })
      .returning({
        email: portalUsers.email,
        fullName: portalUsers.fullName,
        id: portalUsers.id,
      })

    if (!createdUser) {
      throw new Error('Failed to seed e2e portal user.')
    }

    return createdUser
  })
}
