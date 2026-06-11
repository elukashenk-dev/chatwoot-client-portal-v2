import { describe, expect, it } from 'vitest'

import {
  buildProvisioningServiceUsers,
  normalizeTenantProvisioningInput,
  type TenantProvisioningInput,
} from './input.js'

type CustomDomainInput = Extract<
  TenantProvisioningInput,
  { mode: 'custom_domain' }
>
type ProviderSubdomainInput = Extract<
  TenantProvisioningInput,
  { mode: 'provider_subdomain' }
>

function createCustomDomainInput(
  overrides: Partial<CustomDomainInput> = {},
): CustomDomainInput {
  return {
    chatwootBaseUrl: 'https://example.ru',
    clientAdminEmail: ' Admin@Client.Example ',
    clientAdminName: ' Client Admin ',
    displayName: ' Бухфирма ',
    mode: 'custom_domain',
    primaryDomain: ' LK.BUHFIRMA.RU. ',
    publicBaseUrl: 'https://lk.buhfirma.ru/',
    serviceEmailDomain: ' Portal-Service.Example.Com. ',
    slug: ' BuhFirma ',
    ...overrides,
  }
}

function createProviderSubdomainInput(
  overrides: Partial<ProviderSubdomainInput> = {},
): ProviderSubdomainInput {
  return {
    chatwootBaseUrl: 'https://example.ru',
    clientAdminEmail: ' Admin@Client.Example ',
    clientAdminName: ' Client Admin ',
    displayName: ' Бухфирма ',
    mode: 'provider_subdomain',
    providerSubdomain: 'buhfirma',
    providerTenantDomainSuffix: ' Portal.Example.Com. ',
    serviceEmailDomain: ' Portal-Service.Example.Com. ',
    slug: ' BuhFirma ',
    ...overrides,
  }
}

describe('normalizeTenantProvisioningInput', () => {
  it('normalizes custom-domain input without deriving Chatwoot base URL', () => {
    expect(normalizeTenantProvisioningInput(createCustomDomainInput())).toEqual(
      {
        chatwootBaseUrl: 'https://example.ru',
        clientAdminEmail: 'admin@client.example',
        clientAdminName: 'Client Admin',
        displayName: 'Бухфирма',
        domainMode: 'custom_domain',
        primaryDomain: 'lk.buhfirma.ru',
        providerSubdomain: null,
        providerTenantDomainSuffix: null,
        publicBaseUrl: 'https://lk.buhfirma.ru',
        serviceEmailDomain: 'portal-service.example.com',
        slug: 'buhfirma',
      },
    )
  })

  it('requires custom-domain primaryDomain and publicBaseUrl to match', () => {
    expect(() =>
      normalizeTenantProvisioningInput({
        ...createCustomDomainInput(),
        primaryDomain: '',
      }),
    ).toThrow('Tenant primary domain')
    expect(() =>
      normalizeTenantProvisioningInput({
        ...createCustomDomainInput(),
        publicBaseUrl: '',
      }),
    ).toThrow('publicBaseUrl')
    expect(() =>
      normalizeTenantProvisioningInput({
        ...createCustomDomainInput(),
        primaryDomain: 'https://lk.buhfirma.ru/path',
      }),
    ).toThrow('Tenant primary domain')
    expect(() =>
      normalizeTenantProvisioningInput({
        ...createCustomDomainInput(),
        publicBaseUrl: 'https://other.buhfirma.ru',
      }),
    ).toThrow('hostname must match primaryDomain')
  })

  it('normalizes provider-subdomain input into primaryDomain and publicBaseUrl', () => {
    expect(
      normalizeTenantProvisioningInput(createProviderSubdomainInput()),
    ).toMatchObject({
      chatwootBaseUrl: 'https://example.ru',
      domainMode: 'provider_subdomain',
      primaryDomain: 'buhfirma.portal.example.com',
      providerSubdomain: 'buhfirma',
      providerTenantDomainSuffix: 'portal.example.com',
      publicBaseUrl: 'https://buhfirma.portal.example.com',
      slug: 'buhfirma',
    })
  })

  it('requires provider-subdomain fields and exact slug match', () => {
    expect(() =>
      normalizeTenantProvisioningInput({
        ...createProviderSubdomainInput(),
        providerSubdomain: '',
      }),
    ).toThrow('Provider subdomain is required')
    expect(() =>
      normalizeTenantProvisioningInput({
        ...createProviderSubdomainInput(),
        providerTenantDomainSuffix: '',
      }),
    ).toThrow('Provider tenant domain suffix')
    expect(() =>
      normalizeTenantProvisioningInput({
        ...createProviderSubdomainInput(),
        providerSubdomain: 'other',
      }),
    ).toThrow('Provider subdomain must match tenant slug')
  })

  it.each([
    'Buhfirma',
    'buh.firma',
    'https://buhfirma',
    'buhfirma/path',
    'buh firma',
    'buh_firma',
    '*.buhfirma',
    'бухфирма',
    '-buhfirma',
    'buhfirma-',
    'a'.repeat(64),
    'admin',
    'api',
    'www',
    'mail',
    'chat',
    'support',
  ])('rejects unsafe provider subdomain %s', (providerSubdomain) => {
    expect(() =>
      normalizeTenantProvisioningInput(
        createProviderSubdomainInput({
          providerSubdomain,
          slug: providerSubdomain,
        }),
      ),
    ).toThrow()
  })

  it('rejects unsafe provider domain suffixes', () => {
    for (const providerTenantDomainSuffix of [
      'https://portal.example.com',
      'portal.example.com/path',
      'portal.example.com:443',
      '*.portal.example.com',
    ]) {
      expect(() =>
        normalizeTenantProvisioningInput(
          createProviderSubdomainInput({ providerTenantDomainSuffix }),
        ),
      ).toThrow()
    }
  })

  it('requires explicit Chatwoot base URL and supports apex Chatwoot hosts', () => {
    expect(() =>
      normalizeTenantProvisioningInput({
        ...createProviderSubdomainInput(),
        chatwootBaseUrl: 'example.ru',
      }),
    ).toThrow('chatwootBaseUrl')
    expect(() =>
      normalizeTenantProvisioningInput({
        ...createProviderSubdomainInput(),
        chatwootBaseUrl: 'ftp://example.ru',
      }),
    ).toThrow('chatwootBaseUrl')
    expect(
      normalizeTenantProvisioningInput({
        ...createProviderSubdomainInput(),
        chatwootBaseUrl: 'https://example.ru/',
      }).chatwootBaseUrl,
    ).toBe('https://example.ru')
  })

  it('requires service email domain to be a domain, not a URL', () => {
    expect(() =>
      normalizeTenantProvisioningInput({
        ...createProviderSubdomainInput(),
        serviceEmailDomain: 'https://portal-service.example.com',
      }),
    ).toThrow('service email domain')
  })
})

describe('buildProvisioningServiceUsers', () => {
  it('builds deterministic service emails', () => {
    expect(
      buildProvisioningServiceUsers({
        serviceEmailDomain: 'Portal-Service.Example.Com.',
        slug: ' BuhFirma ',
      }),
    ).toEqual({
      adminVerificationEmail:
        'portal-admin-verify+buhfirma@portal-service.example.com',
      runtimeEmail: 'portal-runtime+buhfirma@portal-service.example.com',
    })
  })
})
