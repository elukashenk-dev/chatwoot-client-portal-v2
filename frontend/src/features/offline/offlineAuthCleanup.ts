import { openOfflineDatabase } from './offlineDatabase'
import {
  deleteStartupAuthSession,
  deleteStartupChatFallback,
} from './startupCache'

type OfflineUserScope = {
  host: string
  tenantSlug: string
  userId: number
}

export async function clearRejectedAuthSnapshot({
  host,
  tenantSlug,
  userId,
}: OfflineUserScope) {
  const userKey = `${tenantSlug}:${userId}`
  let database: Awaited<ReturnType<typeof openOfflineDatabase>> | null = null

  try {
    database = await openOfflineDatabase()
    const transaction = database.transaction(
      ['last_active_identities', 'auth_snapshots'],
      'readwrite',
    )
    const lastActiveStore = transaction.objectStore('last_active_identities')
    const record = await lastActiveStore.get(host)

    await transaction.objectStore('auth_snapshots').delete(userKey)

    if (record?.tenantSlug === tenantSlug && record.userId === userId) {
      await lastActiveStore.delete(host)
    }

    await transaction.done
  } finally {
    database?.close()
    deleteStartupAuthSession(host)
    deleteStartupChatFallback({
      host,
      tenantSlug,
      userId,
    })
  }
}
