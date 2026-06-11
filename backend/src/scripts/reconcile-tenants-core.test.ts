import { describe, expect, it } from 'vitest'

import {
  parseReconcileTenantsArgs,
  ReconcileTenantsCliConfigError,
} from './reconcile-tenants-core.js'

describe('parseReconcileTenantsArgs', () => {
  it('accepts dry-run mode', () => {
    expect(parseReconcileTenantsArgs(['--dry-run'])).toEqual({
      dryRun: true,
    })
  })

  it('accepts apply mode', () => {
    expect(parseReconcileTenantsArgs(['--apply'])).toEqual({
      dryRun: false,
    })
  })

  it('requires exactly one mode flag', () => {
    expect(() => parseReconcileTenantsArgs([])).toThrowError(
      'Pass exactly one of --dry-run or --apply.',
    )
    expect(() =>
      parseReconcileTenantsArgs(['--dry-run', '--apply']),
    ).toThrowError('Pass exactly one of --dry-run or --apply.')
  })

  it('rejects unknown arguments with a typed config error', () => {
    expect(() => parseReconcileTenantsArgs(['--tenant=buhfirma'])).toThrow(
      ReconcileTenantsCliConfigError,
    )
  })
})
