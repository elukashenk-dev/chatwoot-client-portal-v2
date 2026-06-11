import { describe, expect, it } from 'vitest'

import type { ProvisionTenantResult } from '../modules/tenant-provisioning/service.js'
import {
  buildCreateTenantRuntimeConfig,
  createSafeTenantProvisioningReport,
  CreateTenantCliConfigError,
  parseCreateTenantArgs,
} from './create-tenant-core.js'

const customDomainArgs = [
  '--slug=buhfirma',
  '--display-name=Бухфирма',
  '--primary-domain=lk.buhfirma.ru',
  '--public-base-url=https://lk.buhfirma.ru',
  '--chatwoot-base-url=https://example.ru',
  '--client-admin-email=admin@buhfirma.ru',
  '--client-admin-name=Иван Админ',
]

const providerSubdomainArgs = [
  '--slug=buhfirma',
  '--display-name=Бухфирма',
  '--provider-subdomain=buhfirma',
  '--chatwoot-base-url=https://example.ru',
  '--client-admin-email=admin@buhfirma.example',
  '--client-admin-name=Иван Админ',
]

const requiredEnv = {
  CHATWOOT_PLATFORM_API_ACCESS_TOKEN: 'platform-token',
  DATABASE_URL: 'postgres://portal:portal@localhost:5432/portal',
  PORTAL_PROVISIONING_SERVICE_EMAIL_DOMAIN: 'portal.example.com',
  PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX: 'portal.example.com',
  PORTAL_TENANT_SECRET_KEY: Buffer.alloc(32, 3).toString('base64'),
}

describe('parseCreateTenantArgs', () => {
  it('parses custom-domain tenant creation arguments', () => {
    expect(parseCreateTenantArgs(customDomainArgs)).toEqual({
      chatwootBaseUrl: 'https://example.ru',
      clientAdminEmail: 'admin@buhfirma.ru',
      clientAdminName: 'Иван Админ',
      displayName: 'Бухфирма',
      primaryDomain: 'lk.buhfirma.ru',
      publicBaseUrl: 'https://lk.buhfirma.ru',
      slug: 'buhfirma',
    })
  })

  it('parses provider-subdomain tenant creation arguments', () => {
    expect(parseCreateTenantArgs(providerSubdomainArgs)).toEqual({
      chatwootBaseUrl: 'https://example.ru',
      clientAdminEmail: 'admin@buhfirma.example',
      clientAdminName: 'Иван Админ',
      displayName: 'Бухфирма',
      providerSubdomain: 'buhfirma',
      slug: 'buhfirma',
    })
  })

  it.each([
    [
      'rejects provider-subdomain with primary-domain',
      [...providerSubdomainArgs, '--primary-domain=lk.buhfirma.ru'],
      '--provider-subdomain cannot be used together with --primary-domain.',
    ],
    [
      'rejects provider-subdomain with public-base-url',
      [...providerSubdomainArgs, '--public-base-url=https://lk.buhfirma.ru'],
      '--provider-subdomain cannot be used together with --public-base-url.',
    ],
    [
      'rejects provider-subdomain that does not match the slug',
      providerSubdomainArgs.map((arg) =>
        arg === '--provider-subdomain=buhfirma'
          ? '--provider-subdomain=other'
          : arg,
      ),
      'Provider subdomain must match tenant slug.',
    ],
    [
      'rejects an empty provider-subdomain value',
      providerSubdomainArgs.map((arg) =>
        arg === '--provider-subdomain=buhfirma' ? '--provider-subdomain=' : arg,
      ),
      'Provider subdomain is required.',
    ],
    [
      'rejects primary-domain without public-base-url',
      customDomainArgs.filter((arg) => !arg.startsWith('--public-base-url=')),
      '--public-base-url is required when --primary-domain is provided.',
    ],
    [
      'rejects public-base-url without primary-domain',
      customDomainArgs.filter((arg) => !arg.startsWith('--primary-domain=')),
      '--primary-domain is required when --public-base-url is provided.',
    ],
  ])('%s', (_, argv, message) => {
    expect(() => parseCreateTenantArgs(argv)).toThrowError(message)
  })

  it.each(['admin', 'api', 'www', 'mail', 'chat', 'support'])(
    'rejects reserved provider subdomain "%s"',
    (providerSubdomain) => {
      expect(() =>
        parseCreateTenantArgs(
          providerSubdomainArgs.map((arg) => {
            if (arg === '--slug=buhfirma') {
              return `--slug=${providerSubdomain}`
            }

            if (arg === '--provider-subdomain=buhfirma') {
              return `--provider-subdomain=${providerSubdomain}`
            }

            return arg
          }),
        ),
      ).toThrowError('Provider subdomain must be a safe lowercase DNS label.')
    },
  )

  it('fails clearly when required args are missing', () => {
    expect(() =>
      parseCreateTenantArgs(
        customDomainArgs.filter((arg) => !arg.startsWith('--display-name=')),
      ),
    ).toThrowError('--display-name is required.')
  })
})

describe('buildCreateTenantRuntimeConfig', () => {
  it('builds a custom-domain provisioning input with required runtime env', () => {
    expect(
      buildCreateTenantRuntimeConfig({
        args: parseCreateTenantArgs(customDomainArgs),
        env: requiredEnv,
      }),
    ).toMatchObject({
      databaseUrl: 'postgres://portal:portal@localhost:5432/portal',
      platformApiAccessToken: 'platform-token',
      provisioningInput: {
        chatwootBaseUrl: 'https://example.ru',
        clientAdminEmail: 'admin@buhfirma.ru',
        clientAdminName: 'Иван Админ',
        displayName: 'Бухфирма',
        mode: 'custom_domain',
        primaryDomain: 'lk.buhfirma.ru',
        publicBaseUrl: 'https://lk.buhfirma.ru',
        serviceEmailDomain: 'portal.example.com',
        slug: 'buhfirma',
      },
      tenantSecretKey: requiredEnv.PORTAL_TENANT_SECRET_KEY,
    })
  })

  it('builds a provider-subdomain provisioning input from the provider suffix env', () => {
    expect(
      buildCreateTenantRuntimeConfig({
        args: parseCreateTenantArgs(providerSubdomainArgs),
        env: requiredEnv,
      }).provisioningInput,
    ).toEqual({
      chatwootBaseUrl: 'https://example.ru',
      clientAdminEmail: 'admin@buhfirma.example',
      clientAdminName: 'Иван Админ',
      displayName: 'Бухфирма',
      mode: 'provider_subdomain',
      providerSubdomain: 'buhfirma',
      providerTenantDomainSuffix: 'portal.example.com',
      serviceEmailDomain: 'portal.example.com',
      slug: 'buhfirma',
    })
  })

  it.each([
    ['CHATWOOT_PLATFORM_API_ACCESS_TOKEN'],
    ['DATABASE_URL'],
    ['PORTAL_PROVISIONING_SERVICE_EMAIL_DOMAIN'],
    ['PORTAL_TENANT_SECRET_KEY'],
  ] as const)('fails clearly when %s is missing', (key) => {
    expect(() =>
      buildCreateTenantRuntimeConfig({
        args: parseCreateTenantArgs(customDomainArgs),
        env: {
          ...requiredEnv,
          [key]: undefined,
        },
      }),
    ).toThrowError(`${key} is required.`)
  })

  it('requires provider tenant domain suffix only for provider-subdomain mode', () => {
    expect(() =>
      buildCreateTenantRuntimeConfig({
        args: parseCreateTenantArgs(providerSubdomainArgs),
        env: {
          ...requiredEnv,
          PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX: undefined,
        },
      }),
    ).toThrowError(
      'PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX is required for provider-subdomain tenants.',
    )

    expect(() =>
      buildCreateTenantRuntimeConfig({
        args: parseCreateTenantArgs(customDomainArgs),
        env: {
          ...requiredEnv,
          PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX: undefined,
        },
      }),
    ).not.toThrow()
  })

  it('throws a typed config error', () => {
    expect(() => parseCreateTenantArgs([])).toThrow(CreateTenantCliConfigError)
  })
})

describe('createSafeTenantProvisioningReport', () => {
  it('returns only the safe provisioning result fields', () => {
    const result = {
      action: 'created',
      ignoredSecret: 'plaintext-secret',
      runId: 4,
      tenant: {
        chatwootAccountId: 9,
        chatwootPortalInboxId: 12,
        id: 5,
        primaryDomain: 'lk.buhfirma.ru',
        publicBaseUrl: 'https://lk.buhfirma.ru',
        slug: 'buhfirma',
        status: 'active',
      },
    } as ProvisionTenantResult & {
      ignoredSecret: string
    }

    expect(createSafeTenantProvisioningReport(result)).toEqual({
      action: 'created',
      runId: 4,
      tenant: {
        chatwootAccountId: 9,
        chatwootPortalInboxId: 12,
        id: 5,
        primaryDomain: 'lk.buhfirma.ru',
        publicBaseUrl: 'https://lk.buhfirma.ru',
        slug: 'buhfirma',
        status: 'active',
      },
    })
    expect(
      JSON.stringify(createSafeTenantProvisioningReport(result)),
    ).not.toContain('plaintext-secret')
  })
})
