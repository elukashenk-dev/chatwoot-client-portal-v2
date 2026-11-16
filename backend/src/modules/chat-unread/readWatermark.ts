import { and, eq } from 'drizzle-orm'
import type { AppDatabase } from '../../db/client.js'
import { portalChatReadWatermarks } from '../../db/schema.js'

type Transaction = Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export async function lockReadWatermark(
  tx: Transaction,
  input: {
    tenantId: number
    portalUserId: number
    threadId: string
    sourceKey: string
  },
) {
  await tx
    .insert(portalChatReadWatermarks)
    .values({ ...input, lastReadMessageId: 0 })
    .onConflictDoNothing()
  const [watermark] = await tx
    .select()
    .from(portalChatReadWatermarks)
    .where(
      and(
        eq(portalChatReadWatermarks.tenantId, input.tenantId),
        eq(portalChatReadWatermarks.portalUserId, input.portalUserId),
        eq(portalChatReadWatermarks.threadId, input.threadId),
        eq(portalChatReadWatermarks.sourceKey, input.sourceKey),
      ),
    )
    .for('update')
  if (!watermark) throw new Error('Read watermark not found')
  return watermark
}
