import { sql } from 'drizzle-orm'

import type { NodeAppDatabase } from '../db/client.js'
import { portalUsers, verificationRecords } from '../db/schema.js'
import { normalizeEmail } from '../lib/email.js'
import { hashPassword } from '../lib/password.js'

export const E2E_PORTAL_USER = {
  email: 'e2e.portal.user@example.test',
  fullName: 'E2E Portal User',
  password: 'PortalPass123!',
} as const

export async function seedE2ePortalUser(
  db: NodeAppDatabase,
  user = E2E_PORTAL_USER,
) {
  const now = new Date()
  const email = normalizeEmail(user.email)
  const passwordHash = await hashPassword(user.password)

  return db.transaction(async (transaction) => {
    await transaction
      .delete(verificationRecords)
      .where(sql`lower(${verificationRecords.email}) = ${email}`)
    await transaction
      .delete(portalUsers)
      .where(sql`lower(${portalUsers.email}) = ${email}`)

    const [createdUser] = await transaction
      .insert(portalUsers)
      .values({
        email,
        fullName: user.fullName,
        isActive: true,
        passwordHash,
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
