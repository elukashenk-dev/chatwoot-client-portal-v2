import { isNetworkOrTimeoutError } from '../../offline/bootCoordinator'
import {
  clearCurrentUserOfflineData,
  offlineStore,
} from '../../offline/offlineStore'
import { saveStartupAuthSession } from '../../offline/startupCache'
import type { OfflineAuthSnapshotRecord } from '../../offline/types'
import { ApiClientError, logout } from '../api/authClient'
import type { AuthenticatedPortalSession } from '../types'

export type OfflineAuthScope = {
  host: string
  tenantSlug: string
  userId: number
}

export type CachedAuthSessionReadResult =
  | {
      scope: OfflineAuthScope
      snapshot: OfflineAuthSnapshotRecord
      status: 'authenticated'
    }
  | {
      scope: OfflineAuthScope | null
      status: 'session_check_required'
    }

const OFFLINE_CLOCK_ROLLBACK_TOLERANCE_MS = 5 * 60 * 1000

export function calculateOfflineAccessUntil({
  sessionExpiresAt,
}: {
  sessionExpiresAt: string
}) {
  return new Date(sessionExpiresAt).toISOString()
}

function authScopeFromRecord(record: OfflineAuthScope): OfflineAuthScope {
  return {
    host: record.host,
    tenantSlug: record.tenantSlug,
    userId: record.userId,
  }
}

function isDeviceClockTrustedForSnapshot(
  snapshot: Pick<OfflineAuthSnapshotRecord, 'lastVerifiedAt' | 'savedAt'>,
  nowMs = Date.now(),
) {
  const lastVerifiedAtMs = new Date(snapshot.lastVerifiedAt).getTime()
  const savedAtMs = new Date(snapshot.savedAt).getTime()

  return (
    lastVerifiedAtMs <= nowMs + OFFLINE_CLOCK_ROLLBACK_TOLERANCE_MS &&
    savedAtMs <= nowMs + OFFLINE_CLOCK_ROLLBACK_TOLERANCE_MS
  )
}

function parseFiniteTime(value: string) {
  const time = new Date(value).getTime()

  return Number.isFinite(time) ? time : null
}

function isOfflineAuthSnapshotReadable(
  snapshot: OfflineAuthSnapshotRecord,
  nowMs = Date.now(),
) {
  const offlineAccessUntilMs = parseFiniteTime(snapshot.offlineAccessUntil)
  const sessionExpiresAtMs = parseFiniteTime(snapshot.sessionExpiresAt)

  return (
    offlineAccessUntilMs !== null &&
    sessionExpiresAtMs !== null &&
    isDeviceClockTrustedForSnapshot(snapshot, nowMs) &&
    sessionExpiresAtMs > nowMs
  )
}

export function isStartupNetworkFailure(error: unknown) {
  return (
    isNetworkOrTimeoutError(error) ||
    (error instanceof ApiClientError && error.statusCode === 0)
  )
}

export async function completePendingLocalDeviceSignout(
  scope: OfflineAuthScope,
) {
  try {
    await logout()
    await clearCurrentUserOfflineData(scope)
    await offlineStore.deleteLocalDeviceSignout(scope.host)
    return true
  } catch {
    return false
  }
}

export async function readCachedAuthSession({
  host,
  tenantSlug,
}: {
  host: string
  tenantSlug: string | null
}): Promise<CachedAuthSessionReadResult> {
  let lastKnownScope: OfflineAuthScope | null = null

  try {
    if (!tenantSlug) {
      return {
        scope: null,
        status: 'session_check_required',
      }
    }

    const signout = await offlineStore.readLocalDeviceSignout(host)

    if (signout) {
      return {
        scope: authScopeFromRecord(signout),
        status: 'session_check_required',
      }
    }

    const identity = await offlineStore.readLastActiveIdentity(host)

    if (!identity || identity.tenantSlug !== tenantSlug) {
      return {
        scope: null,
        status: 'session_check_required',
      }
    }

    const scope = authScopeFromRecord(identity)
    lastKnownScope = scope

    const scopedSignout = await offlineStore.readLocalDeviceSignout(
      host,
      scope.tenantSlug,
      scope.userId,
    )

    if (scopedSignout) {
      return {
        scope,
        status: 'session_check_required',
      }
    }

    const snapshot = await offlineStore.readAuthSnapshot(
      scope.tenantSlug,
      scope.userId,
    )

    if (
      !snapshot ||
      !isOfflineAuthSnapshotReadable(snapshot)
    ) {
      return {
        scope,
        status: 'session_check_required',
      }
    }

    return {
      scope,
      snapshot,
      status: 'authenticated',
    }
  } catch {
    return {
      scope: lastKnownScope,
      status: 'session_check_required',
    }
  }
}

export async function saveOnlineAuthSnapshot({
  currentSession,
  host,
  tenantSlug,
}: {
  currentSession: AuthenticatedPortalSession
  host: string
  tenantSlug: string
}) {
  const now = new Date()
  const scope = {
    host,
    tenantSlug,
    userId: currentSession.user.id,
  }
  const snapshot = {
    lastVerifiedAt: now.toISOString(),
    offlineAccessUntil: calculateOfflineAccessUntil({
      sessionExpiresAt: currentSession.session.expiresAt,
    }),
    savedAt: now.toISOString(),
    sessionExpiresAt: currentSession.session.expiresAt,
    tenantSlug,
    user: currentSession.user,
    userId: currentSession.user.id,
  }

  await offlineStore.saveLastActiveIdentity({
    ...scope,
    savedAt: now.toISOString(),
  })
  await offlineStore.saveAuthSnapshot(snapshot)
  await offlineStore.deleteLocalDeviceSignout(host)
  saveStartupAuthSession({
    host,
    snapshot,
  })

  return scope
}
