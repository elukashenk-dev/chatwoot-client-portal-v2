import { sql } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import { portalRateLimitBuckets } from '../../db/schema.js'

export const CHAT_TEXT_SEND_RATE_LIMIT = {
  maxRequests: 20,
  windowMs: 60_000,
} as const

export const CHAT_ATTACHMENT_SEND_RATE_LIMIT = {
  maxRequests: 5,
  windowMs: 60_000,
} as const

type ChatSendRateLimitKind = 'attachment' | 'text'

type ChatSendRateLimitConfig = {
  maxRequests: number
  windowMs: number
}

type ChatSendRateLimitInput = {
  kind: ChatSendRateLimitKind
  tenantId: number
  threadId: string
  userId: number
}

type FixedWindowConsumeInput = {
  now: Date
  scope: string
  subjectKey: string
  tenantId: number
  windowMs: number
}

type FixedWindowConsumeResult = {
  count: number
  resetAt: Date
}

type ChatSendRateLimitRepository = {
  consumeFixedWindow: (
    input: FixedWindowConsumeInput,
  ) => Promise<FixedWindowConsumeResult>
}

type CreateChatSendRateLimiterOptions = {
  now?: () => Date
  repository: ChatSendRateLimitRepository
}

function getLimitConfig(kind: ChatSendRateLimitKind): ChatSendRateLimitConfig {
  return kind === 'attachment'
    ? CHAT_ATTACHMENT_SEND_RATE_LIMIT
    : CHAT_TEXT_SEND_RATE_LIMIT
}

function buildScope(kind: ChatSendRateLimitKind) {
  return `chat-send:${kind}`
}

function buildSubjectKey({
  threadId,
  userId,
}: {
  threadId: string
  userId: number
}) {
  return `user:${userId}:thread:${threadId}`
}

function calculateRetryAfterSeconds({
  now,
  resetAt,
}: {
  now: Date
  resetAt: Date
}) {
  return Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000))
}

export function createChatSendRateLimitRepository(db: AppDatabase) {
  return {
    async consumeFixedWindow({
      now,
      scope,
      subjectKey,
      tenantId,
      windowMs,
    }: FixedWindowConsumeInput): Promise<FixedWindowConsumeResult> {
      const resetAt = new Date(now.getTime() + windowMs)
      const [bucket] = await db
        .insert(portalRateLimitBuckets)
        .values({
          count: 1,
          resetAt,
          scope,
          subjectKey,
          tenantId,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          set: {
            count: sql`case when ${portalRateLimitBuckets.resetAt} <= ${now} then 1 else ${portalRateLimitBuckets.count} + 1 end`,
            resetAt: sql`case when ${portalRateLimitBuckets.resetAt} <= ${now} then ${resetAt} else ${portalRateLimitBuckets.resetAt} end`,
            updatedAt: now,
          },
          target: [
            portalRateLimitBuckets.tenantId,
            portalRateLimitBuckets.scope,
            portalRateLimitBuckets.subjectKey,
          ],
        })
        .returning({
          count: portalRateLimitBuckets.count,
          resetAt: portalRateLimitBuckets.resetAt,
        })

      if (!bucket) {
        throw new Error('Failed to consume chat send rate limit bucket.')
      }

      return bucket
    },
  } satisfies ChatSendRateLimitRepository
}

export function createChatSendRateLimiter({
  now = () => new Date(),
  repository,
}: CreateChatSendRateLimiterOptions) {
  return {
    async consume(input: ChatSendRateLimitInput) {
      const currentTime = now()
      const config = getLimitConfig(input.kind)
      const bucket = await repository.consumeFixedWindow({
        now: currentTime,
        scope: buildScope(input.kind),
        subjectKey: buildSubjectKey(input),
        tenantId: input.tenantId,
        windowMs: config.windowMs,
      })

      if (bucket.count <= config.maxRequests) {
        return {
          status: 'allowed' as const,
        }
      }

      return {
        retryAfterSeconds: calculateRetryAfterSeconds({
          now: currentTime,
          resetAt: bucket.resetAt,
        }),
        status: 'limited' as const,
      }
    },
  }
}

export type ChatSendRateLimiter = ReturnType<typeof createChatSendRateLimiter>
