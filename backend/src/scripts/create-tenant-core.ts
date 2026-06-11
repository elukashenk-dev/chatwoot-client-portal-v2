import type { AppEnv } from '../config/env.js'
import {
  normalizeTenantProvisioningInput,
  type TenantProvisioningInput,
} from '../modules/tenant-provisioning/input.js'
import type { ProvisionTenantResult } from '../modules/tenant-provisioning/service.js'

export type CreateTenantCliArgs = {
  chatwootBaseUrl: string
  clientAdminEmail: string
  clientAdminName: string
  displayName: string
  primaryDomain?: string
  providerSubdomain?: string
  publicBaseUrl?: string
  slug: string
}

type CreateTenantRuntimeEnv = Pick<
  AppEnv,
  | 'CHATWOOT_PLATFORM_API_ACCESS_TOKEN'
  | 'DATABASE_URL'
  | 'PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX'
  | 'PORTAL_PROVISIONING_SERVICE_EMAIL_DOMAIN'
  | 'PORTAL_TENANT_SECRET_KEY'
>

export type CreateTenantRuntimeConfig = {
  databaseUrl: string
  platformApiAccessToken: string
  provisioningInput: TenantProvisioningInput
  tenantSecretKey: string
}

export class CreateTenantCliConfigError extends Error {
  constructor(message: string) {
    super(message)

    this.name = 'CreateTenantCliConfigError'
  }
}

type RawCreateTenantArgs = Partial<Record<keyof CreateTenantCliArgs, string>>

const cliFlagMap = {
  '--chatwoot-base-url': 'chatwootBaseUrl',
  '--client-admin-email': 'clientAdminEmail',
  '--client-admin-name': 'clientAdminName',
  '--display-name': 'displayName',
  '--primary-domain': 'primaryDomain',
  '--provider-subdomain': 'providerSubdomain',
  '--public-base-url': 'publicBaseUrl',
  '--slug': 'slug',
} as const satisfies Record<string, keyof CreateTenantCliArgs>

function readFlagValue(argv: string[], index: number, flag: string) {
  const current = argv[index]

  if (!current) {
    return null
  }

  if (current.startsWith(`${flag}=`)) {
    return {
      consumedNext: false,
      value: current.slice(flag.length + 1),
    }
  }

  if (current === flag) {
    const value = argv[index + 1]

    if (value === undefined || value.startsWith('--')) {
      throw new CreateTenantCliConfigError(`${flag} requires a value.`)
    }

    return {
      consumedNext: true,
      value,
    }
  }

  return null
}

function requireArg(
  args: RawCreateTenantArgs,
  key: keyof CreateTenantCliArgs,
  flag: string,
) {
  const value = args[key]

  if (typeof value !== 'string' || !value.trim()) {
    throw new CreateTenantCliConfigError(`${flag} is required.`)
  }

  return value
}

function hasArg(args: RawCreateTenantArgs, key: keyof CreateTenantCliArgs) {
  return Object.prototype.hasOwnProperty.call(args, key)
}

function requireEnv(
  env: Partial<CreateTenantRuntimeEnv>,
  key: keyof CreateTenantRuntimeEnv,
) {
  const value = env[key]

  if (typeof value !== 'string' || !value.trim()) {
    throw new CreateTenantCliConfigError(`${key} is required.`)
  }

  return value
}

function normalizeInputForCli(input: TenantProvisioningInput) {
  try {
    return normalizeTenantProvisioningInput(input)
  } catch (error) {
    throw new CreateTenantCliConfigError(
      error instanceof Error ? error.message : String(error),
    )
  }
}

function buildBaseInput(args: RawCreateTenantArgs) {
  return {
    chatwootBaseUrl: requireArg(args, 'chatwootBaseUrl', '--chatwoot-base-url'),
    clientAdminEmail: requireArg(
      args,
      'clientAdminEmail',
      '--client-admin-email',
    ),
    clientAdminName: requireArg(args, 'clientAdminName', '--client-admin-name'),
    displayName: requireArg(args, 'displayName', '--display-name'),
    serviceEmailDomain: 'portal-service.example.com',
    slug: requireArg(args, 'slug', '--slug'),
  }
}

function assertDomainModeArgs(args: RawCreateTenantArgs) {
  if (hasArg(args, 'providerSubdomain')) {
    if (hasArg(args, 'primaryDomain')) {
      throw new CreateTenantCliConfigError(
        '--provider-subdomain cannot be used together with --primary-domain.',
      )
    }

    if (hasArg(args, 'publicBaseUrl')) {
      throw new CreateTenantCliConfigError(
        '--provider-subdomain cannot be used together with --public-base-url.',
      )
    }

    return
  }

  if (hasArg(args, 'primaryDomain') && !hasArg(args, 'publicBaseUrl')) {
    throw new CreateTenantCliConfigError(
      '--public-base-url is required when --primary-domain is provided.',
    )
  }

  if (hasArg(args, 'publicBaseUrl') && !hasArg(args, 'primaryDomain')) {
    throw new CreateTenantCliConfigError(
      '--primary-domain is required when --public-base-url is provided.',
    )
  }

  if (!hasArg(args, 'primaryDomain') || !hasArg(args, 'publicBaseUrl')) {
    throw new CreateTenantCliConfigError(
      'Either --provider-subdomain or --primary-domain with --public-base-url is required.',
    )
  }
}

export function parseCreateTenantArgs(argv: string[]): CreateTenantCliArgs {
  const args: RawCreateTenantArgs = {}

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]

    if (current === '--') {
      continue
    }

    let matched = false

    for (const [flag, key] of Object.entries(cliFlagMap)) {
      const parsedFlag = readFlagValue(argv, index, flag)

      if (!parsedFlag) {
        continue
      }

      args[key] = parsedFlag.value
      matched = true

      if (parsedFlag.consumedNext) {
        index += 1
      }

      break
    }

    if (!matched) {
      throw new CreateTenantCliConfigError(`Unknown argument: ${current}`)
    }
  }

  const baseInput = buildBaseInput(args)

  assertDomainModeArgs(args)

  if (hasArg(args, 'providerSubdomain')) {
    const normalizedInput = normalizeInputForCli({
      ...baseInput,
      mode: 'provider_subdomain',
      providerSubdomain: args.providerSubdomain ?? '',
      providerTenantDomainSuffix: 'portal.example.com',
    })
    const providerSubdomain = normalizedInput.providerSubdomain

    if (!providerSubdomain) {
      throw new CreateTenantCliConfigError('Provider subdomain is required.')
    }

    return {
      chatwootBaseUrl: normalizedInput.chatwootBaseUrl,
      clientAdminEmail: normalizedInput.clientAdminEmail,
      clientAdminName: normalizedInput.clientAdminName,
      displayName: normalizedInput.displayName,
      providerSubdomain,
      slug: normalizedInput.slug,
    }
  }

  const primaryDomain = args.primaryDomain
  const publicBaseUrl = args.publicBaseUrl

  if (!primaryDomain || !publicBaseUrl) {
    throw new CreateTenantCliConfigError(
      '--primary-domain and --public-base-url are required for custom-domain tenants.',
    )
  }

  const normalizedInput = normalizeInputForCli({
    ...baseInput,
    mode: 'custom_domain',
    primaryDomain,
    publicBaseUrl,
  })

  return {
    chatwootBaseUrl: normalizedInput.chatwootBaseUrl,
    clientAdminEmail: normalizedInput.clientAdminEmail,
    clientAdminName: normalizedInput.clientAdminName,
    displayName: normalizedInput.displayName,
    primaryDomain: normalizedInput.primaryDomain,
    publicBaseUrl: normalizedInput.publicBaseUrl,
    slug: normalizedInput.slug,
  }
}

export function buildCreateTenantRuntimeConfig({
  args,
  env,
}: {
  args: CreateTenantCliArgs
  env: Partial<CreateTenantRuntimeEnv>
}): CreateTenantRuntimeConfig {
  const databaseUrl = requireEnv(env, 'DATABASE_URL')
  const platformApiAccessToken = requireEnv(
    env,
    'CHATWOOT_PLATFORM_API_ACCESS_TOKEN',
  )
  const serviceEmailDomain = requireEnv(
    env,
    'PORTAL_PROVISIONING_SERVICE_EMAIL_DOMAIN',
  )
  const tenantSecretKey = requireEnv(env, 'PORTAL_TENANT_SECRET_KEY')

  if (args.providerSubdomain !== undefined) {
    const providerTenantDomainSuffix = env.PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX

    if (typeof providerTenantDomainSuffix !== 'string') {
      throw new CreateTenantCliConfigError(
        'PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX is required for provider-subdomain tenants.',
      )
    }
    const normalizedInput = normalizeInputForCli({
      chatwootBaseUrl: args.chatwootBaseUrl,
      clientAdminEmail: args.clientAdminEmail,
      clientAdminName: args.clientAdminName,
      displayName: args.displayName,
      mode: 'provider_subdomain',
      providerSubdomain: args.providerSubdomain,
      providerTenantDomainSuffix,
      serviceEmailDomain,
      slug: args.slug,
    })
    const normalizedProviderSubdomain = normalizedInput.providerSubdomain
    const normalizedProviderTenantDomainSuffix =
      normalizedInput.providerTenantDomainSuffix

    if (!normalizedProviderSubdomain || !normalizedProviderTenantDomainSuffix) {
      throw new CreateTenantCliConfigError(
        'Provider subdomain and domain suffix are required.',
      )
    }

    return {
      databaseUrl,
      platformApiAccessToken,
      provisioningInput: {
        chatwootBaseUrl: normalizedInput.chatwootBaseUrl,
        clientAdminEmail: normalizedInput.clientAdminEmail,
        clientAdminName: normalizedInput.clientAdminName,
        displayName: normalizedInput.displayName,
        mode: 'provider_subdomain',
        providerSubdomain: normalizedProviderSubdomain,
        providerTenantDomainSuffix: normalizedProviderTenantDomainSuffix,
        serviceEmailDomain: normalizedInput.serviceEmailDomain,
        slug: normalizedInput.slug,
      },
      tenantSecretKey,
    }
  }

  if (!args.primaryDomain || !args.publicBaseUrl) {
    throw new CreateTenantCliConfigError(
      '--primary-domain and --public-base-url are required for custom-domain tenants.',
    )
  }

  const normalizedInput = normalizeInputForCli({
    chatwootBaseUrl: args.chatwootBaseUrl,
    clientAdminEmail: args.clientAdminEmail,
    clientAdminName: args.clientAdminName,
    displayName: args.displayName,
    mode: 'custom_domain',
    primaryDomain: args.primaryDomain,
    publicBaseUrl: args.publicBaseUrl,
    serviceEmailDomain,
    slug: args.slug,
  })

  return {
    databaseUrl,
    platformApiAccessToken,
    provisioningInput: {
      chatwootBaseUrl: normalizedInput.chatwootBaseUrl,
      clientAdminEmail: normalizedInput.clientAdminEmail,
      clientAdminName: normalizedInput.clientAdminName,
      displayName: normalizedInput.displayName,
      mode: 'custom_domain',
      primaryDomain: normalizedInput.primaryDomain,
      publicBaseUrl: normalizedInput.publicBaseUrl,
      serviceEmailDomain: normalizedInput.serviceEmailDomain,
      slug: normalizedInput.slug,
    },
    tenantSecretKey,
  }
}

export function createSafeTenantProvisioningReport(
  result: ProvisionTenantResult,
): ProvisionTenantResult {
  return {
    action: result.action,
    runId: result.runId,
    tenant: {
      chatwootAccountId: result.tenant.chatwootAccountId,
      chatwootPortalInboxId: result.tenant.chatwootPortalInboxId,
      id: result.tenant.id,
      primaryDomain: result.tenant.primaryDomain,
      publicBaseUrl: result.tenant.publicBaseUrl,
      slug: result.tenant.slug,
      status: result.tenant.status,
    },
  }
}
