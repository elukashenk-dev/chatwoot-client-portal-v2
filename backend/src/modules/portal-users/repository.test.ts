import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { DatabaseClient } from '../../db/client.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import { seedTestTenant } from '../../test/testTenants.js'
import {
  createPortalUsersRepository,
  PortalUserConflictError,
} from './repository.js'

describe('portal users repository', () => {
  let database: DatabaseClient
  let tenantId: number

  beforeEach(async () => {
    database = await createTestDatabase()
    tenantId = (await seedTestTenant(database.db)).id
  })

  afterEach(async () => {
    await database.close()
  })

  it('stores emails in lowercase and trims the display name on create', async () => {
    const repository = createPortalUsersRepository(database.db)

    const user = await repository.create({
      email: ' Name@Company.RU ',
      fullName: '  Portal User  ',
      passwordHash: 'hashed-password',
      tenantId,
    })

    expect(user).toMatchObject({
      email: 'name@company.ru',
      fullName: 'Portal User',
      isActive: true,
    })

    const resolvedUser = await repository.findByEmail({
      email: 'NAME@COMPANY.RU',
      tenantId,
    })

    expect(resolvedUser).toMatchObject({
      email: 'name@company.ru',
      fullName: 'Portal User',
    })
  })

  it('supports portal users without a configured password hash', async () => {
    const repository = createPortalUsersRepository(database.db)

    await repository.create({
      email: 'passwordless@company.ru',
      fullName: 'Passwordless User',
      passwordHash: null,
      tenantId,
    })

    const resolvedUser = await repository.findByEmail({
      email: 'passwordless@company.ru',
      tenantId,
    })

    expect(resolvedUser).toMatchObject({
      email: 'passwordless@company.ru',
      fullName: 'Passwordless User',
      passwordHash: null,
    })
  })

  it('rejects duplicate portal users for the same email regardless of case', async () => {
    const repository = createPortalUsersRepository(database.db)

    await repository.create({
      email: 'Name@Company.RU',
      fullName: 'Portal User',
      passwordHash: 'hashed-password',
      tenantId,
    })

    await expect(
      repository.create({
        email: 'name@company.ru',
        fullName: 'Another User',
        passwordHash: 'another-hash',
        tenantId,
      }),
    ).rejects.toThrow(PortalUserConflictError)
  })

  it('allows the same email in different tenants', async () => {
    const repository = createPortalUsersRepository(database.db)
    const otherTenantId = (
      await seedTestTenant(database.db, {
        primaryDomain: 'other.localhost',
        slug: 'other',
      })
    ).id

    await repository.create({
      email: 'Name@Company.RU',
      fullName: 'Tenant One User',
      passwordHash: 'hashed-password',
      tenantId,
    })
    await repository.create({
      email: 'name@company.ru',
      fullName: 'Tenant Two User',
      passwordHash: 'another-hash',
      tenantId: otherTenantId,
    })

    await expect(
      repository.findByEmail({
        email: 'name@company.ru',
        tenantId,
      }),
    ).resolves.toMatchObject({
      fullName: 'Tenant One User',
    })
    await expect(
      repository.findByEmail({
        email: 'name@company.ru',
        tenantId: otherTenantId,
      }),
    ).resolves.toMatchObject({
      fullName: 'Tenant Two User',
    })
  })
})
