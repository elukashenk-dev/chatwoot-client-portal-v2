import type { AppDatabase } from '../db/client.js'
import {
  cleanupPortalMaintenanceData,
  DEFAULT_PORTAL_MAINTENANCE_RETENTION,
  type CleanupPortalMaintenanceDataResult,
  type PortalMaintenanceRetention,
} from '../modules/maintenance/cleanup.js'

type CleanupMaintenanceDataOptions = {
  db: AppDatabase
  dryRun?: boolean
  now?: Date
  retention?: Partial<PortalMaintenanceRetention>
  tenantId?: number
}

export type ParsedCleanupMaintenanceArgs = {
  dryRun: boolean
  tenantId?: number
}

export type CleanupMaintenanceDataReport =
  CleanupPortalMaintenanceDataResult & {
    retention: PortalMaintenanceRetention
    tenantId: number | null
  }

export function parseCleanupMaintenanceArgs(
  argv: string[],
): ParsedCleanupMaintenanceArgs {
  const parsedArgs: ParsedCleanupMaintenanceArgs = {
    dryRun: false,
  }

  for (const arg of argv) {
    if (arg === '--') {
      continue
    }

    if (arg === '--dry-run') {
      parsedArgs.dryRun = true
      continue
    }

    if (arg.startsWith('--tenant-id=')) {
      const tenantId = Number(arg.slice('--tenant-id='.length))

      if (!Number.isInteger(tenantId) || tenantId <= 0) {
        throw new Error('--tenant-id must be a positive integer.')
      }

      parsedArgs.tenantId = tenantId
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return parsedArgs
}

export async function cleanupMaintenanceData({
  db,
  dryRun = false,
  now,
  retention,
  tenantId,
}: CleanupMaintenanceDataOptions): Promise<CleanupMaintenanceDataReport> {
  const resolvedRetention = {
    ...DEFAULT_PORTAL_MAINTENANCE_RETENTION,
    ...retention,
  }
  const cleanupOptions: Parameters<typeof cleanupPortalMaintenanceData>[1] = {
    dryRun,
    retention: resolvedRetention,
  }

  if (now !== undefined) {
    cleanupOptions.now = now
  }

  if (tenantId !== undefined) {
    cleanupOptions.tenantId = tenantId
  }

  const result = await cleanupPortalMaintenanceData(db, cleanupOptions)

  return {
    ...result,
    retention: resolvedRetention,
    tenantId: tenantId ?? null,
  }
}
