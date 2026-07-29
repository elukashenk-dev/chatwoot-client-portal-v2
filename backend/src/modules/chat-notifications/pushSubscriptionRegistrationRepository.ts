import { and, desc, eq, ne, notInArray, sql } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import { portalPushSubscriptions } from '../../db/schema.js'

type SavePushSubscriptionInput = {
  auth: string
  deviceId: string
  endpoint: string
  now: Date
  p256dh: string
  portalUserId: number
  userAgent: string | null
  vapidKeyId: string
  vapidPublicKeyFingerprint: string
}

export const MAX_ACTIVE_PUSH_SUBSCRIPTIONS = 5

const PUSH_TENANT_REGISTRATION_LOCK_NAMESPACE = 1_347_769_160

export class PushSubscriptionRegistrationBusyError extends Error {
  constructor() {
    super('Push subscription registration is busy.')
    this.name = 'PushSubscriptionRegistrationBusyError'
  }
}

export function createPushSubscriptionRegistrationRepository(
  db: AppDatabase,
  { tenantId }: { tenantId: number },
) {
  return {
    async savePushSubscription({
      auth,
      deviceId,
      endpoint,
      now,
      p256dh,
      portalUserId,
      userAgent,
      vapidKeyId,
      vapidPublicKeyFingerprint,
    }: SavePushSubscriptionInput) {
      await db.transaction(async (tx) => {
        const [lock] = await tx
          .select({
            acquired: sql<boolean>`pg_try_advisory_xact_lock(${PUSH_TENANT_REGISTRATION_LOCK_NAMESPACE}, ${tenantId})`,
          })
          .from(sql`(select 1) as push_subscription_registration_lock`)

        if (!lock?.acquired) {
          throw new PushSubscriptionRegistrationBusyError()
        }

        await tx
          .update(portalPushSubscriptions)
          .set({
            status: 'disabled',
            updatedAt: now,
          })
          .where(
            and(
              eq(portalPushSubscriptions.tenantId, tenantId),
              eq(portalPushSubscriptions.portalUserId, portalUserId),
              eq(portalPushSubscriptions.deviceId, deviceId),
              eq(portalPushSubscriptions.status, 'active'),
              ne(portalPushSubscriptions.endpoint, endpoint),
            ),
          )

        await tx
          .insert(portalPushSubscriptions)
          .values({
            auth,
            deviceId,
            endpoint,
            p256dh,
            portalUserId,
            status: 'active',
            tenantId,
            updatedAt: now,
            userAgent,
            vapidKeyId,
            vapidPublicKeyFingerprint,
          })
          .onConflictDoUpdate({
            set: {
              auth,
              deviceId,
              p256dh,
              status: 'active',
              updatedAt: now,
              userAgent,
              vapidKeyId,
              vapidPublicKeyFingerprint,
            },
            target: [
              portalPushSubscriptions.tenantId,
              portalPushSubscriptions.portalUserId,
              portalPushSubscriptions.endpoint,
            ],
          })

        await tx
          .update(portalPushSubscriptions)
          .set({
            status: 'disabled',
            updatedAt: now,
          })
          .where(
            and(
              eq(portalPushSubscriptions.tenantId, tenantId),
              eq(portalPushSubscriptions.endpoint, endpoint),
              eq(portalPushSubscriptions.status, 'active'),
              ne(portalPushSubscriptions.portalUserId, portalUserId),
            ),
          )

        const activeSubscriptions = await tx
          .select({
            id: portalPushSubscriptions.id,
          })
          .from(portalPushSubscriptions)
          .where(
            and(
              eq(portalPushSubscriptions.tenantId, tenantId),
              eq(portalPushSubscriptions.portalUserId, portalUserId),
              eq(portalPushSubscriptions.status, 'active'),
            ),
          )
          .orderBy(
            desc(portalPushSubscriptions.updatedAt),
            desc(portalPushSubscriptions.id),
          )
          .limit(MAX_ACTIVE_PUSH_SUBSCRIPTIONS + 1)

        if (activeSubscriptions.length <= MAX_ACTIVE_PUSH_SUBSCRIPTIONS) {
          return
        }

        await tx
          .update(portalPushSubscriptions)
          .set({
            status: 'disabled',
            updatedAt: now,
          })
          .where(
            and(
              eq(portalPushSubscriptions.tenantId, tenantId),
              eq(portalPushSubscriptions.portalUserId, portalUserId),
              eq(portalPushSubscriptions.status, 'active'),
              notInArray(
                portalPushSubscriptions.id,
                activeSubscriptions
                  .slice(0, MAX_ACTIVE_PUSH_SUBSCRIPTIONS)
                  .map(({ id }) => id),
              ),
            ),
          )
      })
    },
  }
}
