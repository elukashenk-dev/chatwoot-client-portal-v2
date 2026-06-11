export type DeprovisionTenantCliArgs = {
  confirmSlug: string
  deleteChatwootAccount: boolean
  tenantSlug: string
}

export class DeprovisionTenantCliConfigError extends Error {
  constructor(message: string) {
    super(message)

    this.name = 'DeprovisionTenantCliConfigError'
  }
}

function readRequiredValue(value: string | undefined, flag: string) {
  if (!value?.trim()) {
    throw new DeprovisionTenantCliConfigError(`${flag} is required.`)
  }

  return value
}

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
      throw new DeprovisionTenantCliConfigError(`${flag} requires a value.`)
    }

    return {
      consumedNext: true,
      value,
    }
  }

  return null
}

export function parseDeprovisionTenantArgs(
  argv: string[],
): DeprovisionTenantCliArgs {
  let confirmSlug: string | undefined
  let deleteChatwootAccount = false
  let archiveOnly = false
  let tenantSlug: string | undefined

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]

    if (current === '--') {
      continue
    }

    if (current === '--archive-only') {
      archiveOnly = true
      continue
    }

    if (current === '--delete-chatwoot-account') {
      deleteChatwootAccount = true
      continue
    }

    const tenantValue = readFlagValue(argv, index, '--tenant')

    if (tenantValue) {
      tenantSlug = tenantValue.value

      if (tenantValue.consumedNext) {
        index += 1
      }

      continue
    }

    const confirmValue = readFlagValue(argv, index, '--confirm')

    if (confirmValue) {
      confirmSlug = confirmValue.value

      if (confirmValue.consumedNext) {
        index += 1
      }

      continue
    }

    throw new DeprovisionTenantCliConfigError(`Unknown argument: ${current}`)
  }

  const normalizedTenantSlug = readRequiredValue(tenantSlug, '--tenant')
  const normalizedConfirmSlug = readRequiredValue(confirmSlug, '--confirm')

  if (Number(archiveOnly) + Number(deleteChatwootAccount) !== 1) {
    throw new DeprovisionTenantCliConfigError(
      'Pass exactly one of --archive-only or --delete-chatwoot-account.',
    )
  }

  return {
    confirmSlug: normalizedConfirmSlug,
    deleteChatwootAccount,
    tenantSlug: normalizedTenantSlug,
  }
}
