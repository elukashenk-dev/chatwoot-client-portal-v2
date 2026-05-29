import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('drizzle-orm/pglite/migrator', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('drizzle-orm/pglite/migrator')>()

  return {
    ...original,
    migrate: vi.fn(original.migrate),
  }
})

describe('createTestDatabase migration cache', () => {
  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it(
    'runs migrations once and reuses the migrated template for later test databases',
    async () => {
      const { migrate } = await import('drizzle-orm/pglite/migrator')
      const { createTestDatabase } = await import('./testDatabase.js')

      const firstDatabase = await createTestDatabase()
      try {
        const secondDatabase = await createTestDatabase()

        try {
          expect(migrate).toHaveBeenCalledTimes(1)
        } finally {
          await secondDatabase.close()
        }
      } finally {
        await firstDatabase.close()
      }
    },
    15000,
  )
})
