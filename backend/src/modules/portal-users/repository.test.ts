import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { DatabaseClient } from '../../db/client.js'
import { createTestDatabase } from '../../test/testDatabase.js'
import { createPortalUsersRepository, PortalUserConflictError } from './repository.js'

describe('portal users repository', () => {
  let database: DatabaseClient

  beforeEach(async () => {
    database = await createTestDatabase()
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
    })

    expect(user).toMatchObject({
      email: 'name@company.ru',
      fullName: 'Portal User',
      isActive: true,
    })

    const resolvedUser = await repository.findByEmail('NAME@COMPANY.RU')

    expect(resolvedUser).toMatchObject({
      email: 'name@company.ru',
      fullName: 'Portal User',
    })
  })

  it('rejects duplicate portal users for the same email regardless of case', async () => {
    const repository = createPortalUsersRepository(database.db)

    await repository.create({
      email: 'Name@Company.RU',
      fullName: 'Portal User',
      passwordHash: 'hashed-password',
    })

    await expect(
      repository.create({
        email: 'name@company.ru',
        fullName: 'Another User',
        passwordHash: 'another-hash',
      }),
    ).rejects.toThrow(PortalUserConflictError)
  })
})
