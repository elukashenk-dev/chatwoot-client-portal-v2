import type {
  ChatMessageReplyPreview,
  ChatMessagesSnapshot,
  ChatThreadSummary,
} from '../chat/types'
import type { AuthenticatedPortalUser } from '../auth/types'
import type { PublicTenantContext } from '../tenant/api/tenantClient'

export const OFFLINE_DATABASE_NAME = 'portal-offline'
export const OFFLINE_DATABASE_VERSION = 1
export const OFFLINE_AUTH_GRACE_MS = 24 * 60 * 60 * 1000
export const OFFLINE_LOW_QUOTA_USAGE_RATIO = 0.9
export const OFFLINE_MESSAGE_SNAPSHOT_LIMIT = 50

export type OfflineScopedUserKey = `${string}:${number}`

export type OfflineTenantContextRecord = {
  host: string
  savedAt: string
  tenant: PublicTenantContext
}

export type OfflineLastActiveIdentityRecord = {
  host: string
  savedAt: string
  tenantSlug: string
  userId: number
}

export type OfflineLocalDeviceSignoutRecord = {
  createdAt: string
  host: string
  tenantSlug: string
  userId: number
}

export type OfflineAuthSnapshotRecord = {
  lastVerifiedAt: string
  offlineAccessUntil: string
  savedAt: string
  sessionExpiresAt: string
  tenantSlug: string
  user: AuthenticatedPortalUser
  userId: number
}

export type OfflineChatThreadListRecord = {
  activeThreadId: string
  savedAt: string
  tenantSlug: string
  threads: ChatThreadSummary[]
  userId: number
}

export type OfflineChatMessageSnapshotRecord = {
  savedAt: string
  snapshot: ChatMessagesSnapshot
  tenantSlug: string
  threadId: string
  userId: number
}

export type OfflineTextOutboxStatus = 'failed' | 'queued' | 'sending'

export type OfflineTextOutboxRecord = {
  attemptCount: number
  clientMessageKey: string
  content: string
  createdAt: string
  errorCode: string | null
  errorMessage: string | null
  lastAttemptAt: string | null
  nextAttemptAt: string | null
  replyTo: ChatMessageReplyPreview | null
  replyToMessageId: number | null
  sendOwnerId: string | null
  sendingLeaseExpiresAt: string | null
  sendingStartedAt: string | null
  status: OfflineTextOutboxStatus
  tenantSlug: string
  threadId: string
  updatedAt: string
  userId: number
}

export type OfflineSyncLeaseRecord = {
  expiresAt: string
  ownerId: string
}

export type OfflinePushStaleMarkerRecord = {
  chatwootMessageId: number
  createdAt: string
  tenantSlug: string
  threadId: string
  userId: number
}

export type OfflineStorageEstimate = {
  isLowQuota: boolean
  quota: number | null
  usage: number | null
  usageRatio: number | null
}
