import { describe, expect, it } from 'vitest'

import { parseCleanupMaintenanceArgs } from './cleanup-maintenance-data-core.js'

describe('parseCleanupMaintenanceArgs', () => {
  it('accepts pnpm argument separator and cleanup flags', () => {
    expect(
      parseCleanupMaintenanceArgs(['--', '--tenant-id=4', '--dry-run']),
    ).toEqual({
      dryRun: true,
      tenantId: 4,
    })
  })

  it('rejects invalid tenant ids', () => {
    expect(() => parseCleanupMaintenanceArgs(['--tenant-id=0'])).toThrowError(
      '--tenant-id must be a positive integer.',
    )
  })
})
