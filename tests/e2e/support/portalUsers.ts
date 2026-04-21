import { eq } from 'drizzle-orm'

import { createDatabaseClient } from '../../../backend/src/db/client.ts'
import {
  portalUserContactLinks,
  portalUsers,
} from '../../../backend/src/db/schema.ts'
import { seedE2ePortalUser } from '../../../backend/src/test/e2ePortalUser.ts'
import { loadE2eEnv } from './runtimeEnv.ts'

export async function seedPortalUserForE2e(user: {
  email: string
  fullName: string
  password: string
}) {
  const env = loadE2eEnv()
  const database = createDatabaseClient({
    connectionString: env.DATABASE_URL,
  })

  try {
    return await seedE2ePortalUser(database.db, user)
  } finally {
    await database.close()
  }
}

export async function findPortalUserContactLinkForE2e(email: string) {
  const env = loadE2eEnv()
  const database = createDatabaseClient({
    connectionString: env.DATABASE_URL,
  })

  try {
    const [link] = await database.db
      .select({
        chatwootContactId: portalUserContactLinks.chatwootContactId,
        email: portalUsers.email,
        userId: portalUsers.id,
      })
      .from(portalUsers)
      .innerJoin(
        portalUserContactLinks,
        eq(portalUserContactLinks.userId, portalUsers.id),
      )
      .where(eq(portalUsers.email, email))
      .limit(1)

    return link ?? null
  } finally {
    await database.close()
  }
}
