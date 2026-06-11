export type ReconcileTenantsCliArgs = {
  dryRun: boolean
}

export class ReconcileTenantsCliConfigError extends Error {
  constructor(message: string) {
    super(message)

    this.name = 'ReconcileTenantsCliConfigError'
  }
}

export function parseReconcileTenantsArgs(
  argv: string[],
): ReconcileTenantsCliArgs {
  let hasApply = false
  let hasDryRun = false

  for (const arg of argv) {
    if (arg === '--') {
      continue
    }

    if (arg === '--dry-run') {
      hasDryRun = true
      continue
    }

    if (arg === '--apply') {
      hasApply = true
      continue
    }

    throw new ReconcileTenantsCliConfigError(`Unknown argument: ${arg}`)
  }

  if (Number(hasApply) + Number(hasDryRun) !== 1) {
    throw new ReconcileTenantsCliConfigError(
      'Pass exactly one of --dry-run or --apply.',
    )
  }

  return {
    dryRun: hasDryRun,
  }
}
