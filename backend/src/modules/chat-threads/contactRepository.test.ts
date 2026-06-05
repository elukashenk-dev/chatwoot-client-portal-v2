import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { DatabaseClient } from '../../db/client.js'
import { portalUserContactLinks, portalUsers } from '../../db/schema.js'
import { hashPassword } from '../../lib/password.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import { seedTestTenant } from '../../test/testTenants.js'
import { createChatThreadContactRepository } from './contactRepository.js'

async function createUser({
  database,
  email,
  fullName,
  isActive = true,
  tenantId,
}: {
  database: DatabaseClient
  email: string
  fullName: string
  isActive?: boolean
  tenantId: number
}) {
  const [user] = await database.db
    .insert(portalUsers)
    .values({
      email,
      fullName,
      isActive,
      passwordHash: await hashPassword('Secret123'),
      tenantId,
    })
    .returning({
      id: portalUsers.id,
    })

  if (!user) {
    throw new Error('Failed to create test portal user.')
  }

  return user
}

describe('createChatThreadContactRepository', () => {
  let database: DatabaseClient

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.close()
  })

  it('lists only active contact links for the scoped tenant', async () => {
    const tenant = await seedTestTenant(database.db)
    const otherTenant = await seedTestTenant(database.db, {
      primaryDomain: 'other.localhost',
      slug: 'other',
    })
    const activeUser = await createUser({
      database,
      email: 'ivan@example.test',
      fullName: 'Иван Петров',
      tenantId: tenant.id,
    })
    const inactiveUser = await createUser({
      database,
      email: 'inactive@example.test',
      fullName: 'Отключенный пользователь',
      isActive: false,
      tenantId: tenant.id,
    })
    const otherTenantUser = await createUser({
      database,
      email: 'other@example.test',
      fullName: 'Другой tenant',
      tenantId: otherTenant.id,
    })
    const repository = createChatThreadContactRepository(database.db, {
      tenantId: tenant.id,
    })

    await database.db.insert(portalUserContactLinks).values([
      {
        chatwootContactId: 44,
        tenantId: tenant.id,
        userId: activeUser.id,
      },
      {
        chatwootContactId: 55,
        tenantId: tenant.id,
        userId: inactiveUser.id,
      },
      {
        chatwootContactId: 66,
        tenantId: otherTenant.id,
        userId: otherTenantUser.id,
      },
    ])

    await expect(
      repository.listActivePortalUserContactLinks(),
    ).resolves.toEqual([
      {
        chatwootContactId: 44,
        email: 'ivan@example.test',
        fullName: 'Иван Петров',
        userId: activeUser.id,
      },
      ])
  })

  it('finds an active participant contact link by portal user id in the scoped tenant', async () => {
    const tenant = await seedTestTenant(database.db)
    const otherTenant = await seedTestTenant(database.db, {
      primaryDomain: 'other.localhost',
      slug: 'other',
    })
    const activeUser = await createUser({
      database,
      email: 'ivan@example.test',
      fullName: 'Иван Петров',
      tenantId: tenant.id,
    })
    const inactiveUser = await createUser({
      database,
      email: 'inactive@example.test',
      fullName: 'Отключенный пользователь',
      isActive: false,
      tenantId: tenant.id,
    })
    const otherTenantUser = await createUser({
      database,
      email: 'other@example.test',
      fullName: 'Другой tenant',
      tenantId: otherTenant.id,
    })
    const repository = createChatThreadContactRepository(database.db, {
      tenantId: tenant.id,
    })

    await database.db.insert(portalUserContactLinks).values([
      {
        chatwootContactId: 44,
        tenantId: tenant.id,
        userId: activeUser.id,
      },
      {
        chatwootContactId: 55,
        tenantId: tenant.id,
        userId: inactiveUser.id,
      },
      {
        chatwootContactId: 66,
        tenantId: otherTenant.id,
        userId: otherTenantUser.id,
      },
    ])

    await expect(
      repository.findActivePortalUserContactLinkByUserId(activeUser.id),
    ).resolves.toEqual({
      chatwootContactId: 44,
      userId: activeUser.id,
    })
    await expect(
      repository.findActivePortalUserContactLinkByUserId(inactiveUser.id),
    ).resolves.toBeNull()
    await expect(
      repository.findActivePortalUserContactLinkByUserId(otherTenantUser.id),
    ).resolves.toBeNull()
  })
})
