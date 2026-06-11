import { describe, expect, it } from 'vitest'

import {
  DeprovisionTenantCliConfigError,
  parseDeprovisionTenantArgs,
} from './deprovision-tenant-core.js'

describe('parseDeprovisionTenantArgs', () => {
  it('parses archive-only mode', () => {
    expect(
      parseDeprovisionTenantArgs([
        '--tenant=buhfirma',
        '--archive-only',
        '--confirm=buhfirma',
      ]),
    ).toEqual({
      confirmSlug: 'buhfirma',
      deleteChatwootAccount: false,
      tenantSlug: 'buhfirma',
    })
  })

  it('parses Chatwoot account delete mode', () => {
    expect(
      parseDeprovisionTenantArgs([
        '--tenant=buhfirma',
        '--delete-chatwoot-account',
        '--confirm=buhfirma',
      ]),
    ).toEqual({
      confirmSlug: 'buhfirma',
      deleteChatwootAccount: true,
      tenantSlug: 'buhfirma',
    })
  })

  it('requires tenant, confirmation and exactly one mode', () => {
    expect(() =>
      parseDeprovisionTenantArgs(['--archive-only', '--confirm=buhfirma']),
    ).toThrowError('--tenant is required.')
    expect(() =>
      parseDeprovisionTenantArgs(['--tenant=buhfirma', '--archive-only']),
    ).toThrowError('--confirm is required.')
    expect(() =>
      parseDeprovisionTenantArgs(['--tenant=buhfirma', '--confirm=buhfirma']),
    ).toThrowError(
      'Pass exactly one of --archive-only or --delete-chatwoot-account.',
    )
    expect(() =>
      parseDeprovisionTenantArgs([
        '--tenant=buhfirma',
        '--archive-only',
        '--delete-chatwoot-account',
        '--confirm=buhfirma',
      ]),
    ).toThrowError(
      'Pass exactly one of --archive-only or --delete-chatwoot-account.',
    )
  })

  it('rejects unknown arguments with a typed config error', () => {
    expect(() => parseDeprovisionTenantArgs(['--tenant=buhfirma'])).toThrow(
      DeprovisionTenantCliConfigError,
    )
  })
})
