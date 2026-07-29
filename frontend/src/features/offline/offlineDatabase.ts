import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb'

import {
  OFFLINE_DATABASE_NAME,
  OFFLINE_DATABASE_VERSION,
  PWA_SHARE_DRAFT_EXPIRY_INDEX,
  PWA_SHARE_DRAFT_IDENTITY_INDEX,
  type OfflineAuthSnapshotRecord,
  type OfflineChatMessagePageRecord,
  type OfflineChatMessageSnapshotRecord,
  type OfflineChatThreadListRecord,
  type OfflineLastActiveIdentityRecord,
  type OfflineLocalDeviceSignoutRecord,
  type OfflinePendingShareDraftRecord,
  type OfflinePushStaleMarkerRecord,
  type OfflineSyncLeaseRecord,
  type OfflineTenantContextRecord,
  type OfflineTextOutboxRecord,
} from './types'

export const OFFLINE_STORES = [
  'tenant_contexts',
  'last_active_identities',
  'local_device_signouts',
  'auth_snapshots',
  'chat_thread_lists',
  'chat_message_snapshots',
  'chat_message_pages',
  'chat_text_outbox',
  'sync_leases',
  'push_stale_markers',
  'pending_share_drafts',
] as const

export type OfflineStoreName = (typeof OFFLINE_STORES)[number]

export interface PortalOfflineDatabase extends DBSchema {
  auth_snapshots: {
    key: string
    value: OfflineAuthSnapshotRecord
  }
  chat_message_snapshots: {
    key: string
    value: OfflineChatMessageSnapshotRecord
  }
  chat_message_pages: {
    key: string
    value: OfflineChatMessagePageRecord
  }
  chat_text_outbox: {
    key: string
    value: OfflineTextOutboxRecord
  }
  chat_thread_lists: {
    key: string
    value: OfflineChatThreadListRecord
  }
  last_active_identities: {
    key: string
    value: OfflineLastActiveIdentityRecord
  }
  local_device_signouts: {
    key: string
    value: OfflineLocalDeviceSignoutRecord
  }
  pending_share_drafts: {
    indexes: {
      by_expiry: string
      by_identity: [string, string, number]
    }
    key: string
    value: OfflinePendingShareDraftRecord
  }
  push_stale_markers: {
    key: string
    value: OfflinePushStaleMarkerRecord
  }
  sync_leases: {
    key: string
    value: OfflineSyncLeaseRecord
  }
  tenant_contexts: {
    key: string
    value: OfflineTenantContextRecord
  }
}

export type OfflineDatabase = IDBPDatabase<PortalOfflineDatabase>

export async function openOfflineDatabase(): Promise<OfflineDatabase> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is unavailable.')
  }

  return openDB<PortalOfflineDatabase>(
    OFFLINE_DATABASE_NAME,
    OFFLINE_DATABASE_VERSION,
    {
      upgrade(database) {
        for (const storeName of OFFLINE_STORES) {
          if (database.objectStoreNames.contains(storeName)) {
            continue
          }

          if (storeName === 'pending_share_drafts') {
            const store = database.createObjectStore(storeName, {
              keyPath: 'draftId',
            })

            store.createIndex(
              PWA_SHARE_DRAFT_IDENTITY_INDEX,
              ['host', 'tenantSlug', 'userId'],
              { unique: true },
            )
            store.createIndex(PWA_SHARE_DRAFT_EXPIRY_INDEX, 'expiresAt')
            continue
          }

          database.createObjectStore(storeName)
        }
      },
      blocking() {
        // Let newer app versions upgrade instead of pinning an old connection.
      },
      terminated() {
        // Later reads reopen the database and map failures to controlled UI.
      },
    },
  )
}

export function assertOfflineDatabaseStores(database: OfflineDatabase): void {
  for (const storeName of OFFLINE_STORES) {
    if (!database.objectStoreNames.contains(storeName)) {
      throw new Error(`Offline database store is missing: ${storeName}`)
    }
  }
}

export async function clearOfflineDatabaseForTests(): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return
  }

  await deleteDB(OFFLINE_DATABASE_NAME)
}
