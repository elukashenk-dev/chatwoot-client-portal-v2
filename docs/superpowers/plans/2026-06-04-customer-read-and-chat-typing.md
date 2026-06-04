# Customer Read And Chat Typing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Chatwoot-native "portal customer read agent messages" sync for
agents and honest two-way typing indicators without patching Chatwoot core or
showing false read receipts to portal users.

**Architecture:** Portal backend remains the only Chatwoot authority. The
browser tells the portal backend when the current latest thread is actually
visible; the backend calls Chatwoot public API `update_last_seen`, which lets
Chatwoot mark agent messages as read in the agent dashboard. Portal user typing
is sent through the same backend boundary to Chatwoot public API
`toggle_typing`; Chatwoot agent typing arrives through existing API Channel
`conversation_typing_on/off` webhooks and fans out through portal realtime.

**Tech Stack:** Fastify, TypeScript, Drizzle/Postgres, tenant-scoped Chatwoot
client, Chatwoot API Channel public APIs, Chatwoot API Channel webhooks, React,
Vitest, Playwright runtime smoke.

---

## Status

This plan supersedes and deletes the risky Chatwoot patch plan:

```text
docs/superpowers/plans/2026-06-04-chatwoot-agent-read-webhook-read-receipts.md
```

Do not resurrect `conversation_agent_read` in this portal scope. Chatwoot core
is treated as an external service. Portal user-sent messages stay at one
backend-accepted check in the portal until Chatwoot exposes a real upstream
agent-read event.

## Research Baseline

Checked on `2026-06-04` against official Chatwoot docs and local
`../chatwoot-ce-stable` code.

Official Chatwoot docs:

- Webhook docs and webhook API list `conversation_typing_on` and
  `conversation_typing_off` as supported subscriptions:
  `https://www.chatwoot.com/docs/product/others/webhook-events` and
  `https://developers.chatwoot.com/api-reference/webhooks/add-a-webhook`.
- Chatwoot public API exposes `update_last_seen` for API Channel conversations:
  `https://developers.chatwoot.com/api-reference/conversations-api/update-last-seen`.
- Chatwoot public API exposes `toggle_typing` for API Channel conversations:
  `https://developers.chatwoot.com/api-reference/conversations-api/toggle-typing-status`.
- Chatwoot channel feature docs show API Channel supports outgoing message
  read status:
  `https://developers.chatwoot.com/self-hosted/supported-features`.

Local Chatwoot code facts:

- `app/controllers/public/api/v1/inboxes/conversations_controller.rb`
  `update_last_seen` sets `contact_last_seen_at`, saves the conversation and
  enqueues `Conversations::UpdateMessageStatusJob`.
- `app/jobs/conversations/update_message_status_job.rb` marks non-incoming
  messages created before the contact read timestamp as `read`.
- `app/controllers/public/api/v1/inboxes/conversations_controller.rb`
  `toggle_typing` dispatches `conversation_typing_on/off`.
- `app/listeners/webhook_listener.rb` sends typing events through
  `deliver_webhook_payloads`, which includes API Channel webhooks for
  `Channel::Api`.
- Chatwoot account and public conversation endpoints use conversation
  `display_id` as public `id`. Our current `chatwootConversationId` naming is
  misleading, but the value stored from account API/webhook payloads is the
  display id used by Chatwoot routes.

## Product Contract

What this plan implements:

- Agents in Chatwoot can see that portal users read agent messages in the
  standard Chatwoot message status mechanism.
- Portal users see a textless animated three-dot typing indicator when an agent
  types in Chatwoot. The visible UI does not show agent names or typing words;
  accessibility text is allowed through `aria-label` only.
- Agents see Chatwoot's existing customer typing indicator when a portal user
  types.
- Portal does not show two checks for user-sent messages.

What this plan intentionally does not implement:

- no `conversation_agent_read`;
- no Chatwoot core patch;
- no polling of `agent_last_seen_at`;
- no fake read state from typing events;
- no durable portal-side support-read table;
- no per-user group read receipt in Chatwoot dashboard.

Group rule:

- Customer-read sync is exact for private threads.
- Group customer-read sync is not enabled in this plan because standard
  Chatwoot dashboard has one group contact conversation, not per portal member
  visibility. Marking the group contact read when one member saw the message
  would be a business lie for multi-user groups.
- Typing is allowed in group threads as a generic group/contact typing signal.
  The agent may see the group contact typing, not the individual portal member.

Viewport rule:

- Fresh backend snapshots alone do not mark Chatwoot read.
- Portal marks read only when the latest thread transcript is visible at the
  bottom after render.
- Offline cache, search result context, older-message history and "user scrolled
  up reading history" do not call `update_last_seen`.
- If a new agent message arrives while the user is already at the bottom and
  transcript auto-follow is active, the frontend calls mark-read after the new
  message renders.

## Focused Review: F-CHAT-006 Realtime Health

F-CHAT-006 realtime health was a prerequisite for this plan and is now closed by
Task 0. Current portal code has:

- `useChatRealtimeConnection` consuming SSE `messages` and `chat-state` events;
- `useChatResumeResync` refreshing on browser `online` and foreground
  `visibilitychange`;
- `useChatSnapshotRefresh` fetching the latest active-thread snapshot and
  merging it through `mergeRealtimeSnapshot`.

The missing piece is a visible-tab health monitor for a silent or half-open
`EventSource`. VPN/mobile network failures can keep `navigator.onLine === true`
while no SSE events arrive. That matters for this feature because:

- agent typing reaches portal only through SSE;
- new agent messages reach portal through SSE or snapshot refresh;
- customer read sync is intentionally viewport-driven and can only fire after
  the message actually renders.

Business rule:

- Do not mark Chatwoot read merely because realtime is stale.
- Do not mark the app offline merely because SSE is stale.
- While the tab is visible, backend is usable and SSE has no activity for a
  bounded stale window, refresh the active thread snapshot on a capped interval.
- Stop fallback refresh when realtime activity resumes, when the tab is hidden,
  when backend is unavailable, or when there is no ready active thread.
- Use existing `mergeRealtimeSnapshot` so a fallback snapshot and later realtime
  event cannot duplicate messages.

Task 0 below must be completed before Task 4 read sync and Task 6 agent typing.

## File Structure

- Modify: `frontend/src/features/chat/api/chatRealtimeClient.ts`
  - Add `onError` and activity callbacks for EventSource open/message/error
    bookkeeping.
- Modify: `frontend/src/features/chat/pages/useChatRealtimeConnection.ts`
  - Report realtime activity to the health monitor without changing snapshot
    merge semantics.
- Create: `frontend/src/features/chat/pages/useChatRealtimeHealthFallback.ts`
  - Detect stale visible realtime connections and call bounded
    `refreshChatSnapshot`.
- Create: `frontend/src/features/chat/pages/useChatRealtimeHealthFallback.test.tsx`
  - Unit coverage for stale SSE, recovery, hidden tab and bounded fallback.
- Modify: `frontend/src/features/chat/pages/ChatPage.tsx`
  - Wire realtime activity tracking before customer read/typing hooks.
- Modify: `backend/src/db/schema.ts`
  - Add `portal_tenants.chatwoot_portal_inbox_identifier`.
  - Add `portal_chat_threads.chatwoot_contact_source_id`.
- Create: `backend/drizzle/0007_customer_read_typing_identifiers.sql`
  - Adds the two nullable text columns.
- Create/modify: `backend/drizzle/meta/*_snapshot.json`,
  `backend/drizzle/meta/_journal.json`
  - Drizzle-generated migration metadata for the same schema change.
- Modify: `backend/src/modules/tenants/repository.ts`
  - Persist and read `chatwootPortalInboxIdentifier`.
- Modify: `backend/src/modules/tenants/service.ts`
  - Expose `portalInboxIdentifier` in tenant Chatwoot runtime context.
- Modify: `backend/src/scripts/verify-tenant-chatwoot-connection-core.ts`
  - Read API Channel `inbox_identifier` and persist it.
- Modify: `backend/src/scripts/configure-tenant-chatwoot-webhook-core.ts`
  - Store API Channel `inbox_identifier` together with webhook secret.
- Modify: `backend/src/integrations/chatwoot/client.ts`
  - Parse API Channel `inbox_identifier`.
  - Expose public conversation event methods.
- Create: `backend/src/integrations/chatwoot/publicConversationEvents.ts`
  - Build and call Chatwoot public `update_last_seen` and `toggle_typing`;
    normalize request timeout with the existing Chatwoot request helper.
- Create: `backend/src/integrations/chatwoot/publicConversationEvents.test.ts`
  - Unit coverage for public API URLs, methods, invalid inputs and 404s.
- Modify: `backend/src/modules/chat-threads/repository.ts`
  - Persist `chatwootContactSourceId` in thread records.
- Modify: `backend/src/modules/chat-threads/runtime.ts`
  - Store source id when a contact inbox source id is resolved or created.
- Modify: `backend/src/modules/chat-messages/service.ts`
  - Keep snapshot/unread behavior unchanged; do not call read/typing services
    from message fetching.
- Create: `backend/src/modules/chat-presence/service.ts`
  - Customer read sync and customer typing sync service.
- Create: `backend/src/modules/chat-presence/routes.ts`
  - Authenticated same-origin routes for mark-read and typing.
- Create: `backend/src/modules/chat-presence/service.test.ts`
  - Backend authority tests for private/group/offline/error/throttle behavior.
- Create: `backend/src/modules/chat-presence/routes.test.ts`
  - Route auth, tenant and validation tests.
- Modify: `backend/src/modules/chat-realtime/hub.ts`
  - Add a `typing` event type and publish helper.
- Modify: `backend/src/modules/chat-realtime/routes.ts`
  - No API shape change; SSE sends the new event through existing writer.
- Modify: `backend/src/modules/chatwoot-webhooks/service.ts`
  - Accept `conversation_typing_on/off`, route by conversation mapping and fan
    out agent typing.
  - Parse typing private-note guard from Chatwoot's `is_private` field, not the
    message payload `private` field.
- Modify: `backend/src/modules/chatwoot-webhooks/repository.ts`
  - Existing delivery table is reused; no typing-specific persistence table.
- Modify: `backend/src/app.ts`
  - Register chat presence routes.
- Modify: `frontend/src/features/chat/types.ts`
  - Add typing event and agent typing UI types.
- Modify: `frontend/src/features/chat/api/chatClient.ts`
  - Add `markChatThreadRead` and `setChatThreadTyping`.
- Modify: `frontend/src/features/chat/api/chatRealtimeClient.ts`
  - Add `typing` SSE event handling.
- Create: `frontend/src/features/chat/pages/useChatReadSync.ts`
  - Debounced viewport-driven mark-read hook.
- Create: `frontend/src/features/chat/pages/useChatTypingSync.ts`
  - Debounced portal-user typing hook.
- Modify: `frontend/src/features/chat/pages/useChatRealtimeConnection.ts`
  - Consume realtime typing events.
- Modify: `frontend/src/features/chat/pages/ChatPage.tsx`
  - Wire read sync, typing sync and agent typing indicator.
- Modify: `frontend/src/features/chat/components/ChatTranscript.tsx`
  - Report when latest messages are visible near bottom.
- Modify: `frontend/src/features/chat/components/MessageComposer.tsx`
  - Report draft changes to typing sync.
- Create: `frontend/src/features/chat/components/AgentTypingIndicator.tsx`
  - Small transcript-adjacent indicator.
- Create or modify frontend tests under `frontend/src/features/chat/pages/`.
- Create: `tests/e2e/chat-customer-read-and-typing.spec.ts`
  - Runtime smoke for realtime fallback, read sync and typing webhooks.
- Modify: `docs/product/chat-message-send-ui-scenarios.md`
  - Replace risky read-receipt scenarios with customer-read and typing rules.

## Task 0: Realtime Health Snapshot Fallback

**Files:**

- Modify: `frontend/src/features/chat/api/chatRealtimeClient.ts`
- Modify: `frontend/src/features/chat/pages/useChatRealtimeConnection.ts`
- Modify: `frontend/src/features/chat/pages/useChatRealtimeConnection.test.tsx`
- Create: `frontend/src/features/chat/pages/useChatRealtimeHealthFallback.ts`
- Create: `frontend/src/features/chat/pages/useChatRealtimeHealthFallback.test.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.test.tsx`

Implementation status: completed in Task 0; F-CHAT-006 is closed after
verification. Task 4 and Task 6 can now rely on this realtime health baseline.

- [x] **Step 1: Write failing health fallback tests**

Create `useChatRealtimeHealthFallback.test.tsx` with fake timers.

Cover:

- stale visible realtime triggers `refreshChatSnapshot`;
- normal realtime activity prevents fallback refresh;
- fallback refresh is capped and does not run aggressively;
- hidden document does not refresh;
- unavailable backend does not loop aggressively and lets existing connection
  error handling mark the chat offline;
- changing `realtimeThreadId` resets activity timestamps;
- duplicate merge safety stays delegated to `useChatSnapshotRefresh` and
  `mergeRealtimeSnapshot`.

Example test:

```ts
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useChatRealtimeHealthFallback } from './useChatRealtimeHealthFallback'

describe('useChatRealtimeHealthFallback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('refreshes the active snapshot when visible realtime is stale', async () => {
    const refreshChatSnapshot = vi.fn().mockResolvedValue(undefined)

    renderHook(() =>
      useChatRealtimeHealthFallback({
        canUseBackend: true,
        isRealtimeSupported: true,
        realtimeThreadId: 'private:me',
        refreshChatSnapshot,
        snapshotExists: true,
      }),
    )

    await act(async () => {
      vi.advanceTimersByTime(31_000)
      await Promise.resolve()
    })

    expect(refreshChatSnapshot).toHaveBeenCalledTimes(1)
  })
})
```

- [x] **Step 2: Run failing tests**

Run:

```bash
pnpm --dir frontend exec vitest run \
  src/features/chat/pages/useChatRealtimeHealthFallback.test.tsx \
  src/features/chat/pages/useChatRealtimeConnection.test.tsx \
  src/features/chat/pages/ChatPage.test.tsx
```

Expected: fail because the health fallback hook and realtime activity callback
do not exist.

- [x] **Step 3: Add EventSource activity/error callbacks**

In `chatRealtimeClient.ts`, extend `OpenChatRealtimeInput`:

```ts
type OpenChatRealtimeInput = {
  onActivity?: () => void
  onChatState: (snapshot: ChatMessagesSnapshot) => void
  onError?: () => void
  onOpen?: () => void
  onMessages: (snapshot: ChatMessagesSnapshot) => void
  threadId: string
}
```

Call `onActivity` for `open`, `messages` and `chat-state`. Call `onError` for
EventSource `error`, but do not close the EventSource there; browser retry
behavior remains responsible for reconnecting.

```ts
eventSource.addEventListener('open', () => {
  onActivity?.()
  onOpen?.()
})
eventSource.addEventListener('messages', (event) => {
  onActivity?.()
  onMessages(readSnapshotEvent(event))
})
eventSource.addEventListener('chat-state', (event) => {
  onActivity?.()
  onChatState(readSnapshotEvent(event))
})
eventSource.addEventListener('error', () => {
  onError?.()
})
```

- [x] **Step 4: Report realtime activity from `useChatRealtimeConnection`**

Extend `UseChatRealtimeConnectionInput`:

```ts
type UseChatRealtimeConnectionInput = {
  isMountedRef: MutableRefObject<boolean>
  markBrowserOnline: () => void
  onRealtimeActivity?: () => void
  onRealtimeError?: () => void
  setPageState: Dispatch<SetStateAction<ChatPageState>>
  threadId: string | null
}
```

Pass callbacks to `openChatRealtime`:

```ts
const handleRealtimeActivity = () => {
  onRealtimeActivity?.()
}

const realtimeConnection = openChatRealtime({
  onActivity: handleRealtimeActivity,
  onError: onRealtimeError,
  onChatState: (realtimeSnapshot) => {
    // existing onChatState body stays unchanged
  },
  onMessages: (realtimeSnapshot) => {
    // existing onMessages body stays unchanged
  },
  onOpen: () => {
    // existing onOpen body stays unchanged
  },
  threadId,
})
```

`chatRealtimeClient` reports activity through `onActivity`, so the snapshot
handlers above must not call `handleRealtimeActivity()` again.

- [x] **Step 5: Implement bounded fallback hook**

Create `useChatRealtimeHealthFallback.ts`:

```ts
import { useCallback, useEffect, useRef } from 'react'

const REALTIME_STALE_AFTER_MS = 30_000
const REALTIME_HEALTH_CHECK_INTERVAL_MS = 5_000
const REALTIME_FALLBACK_MIN_INTERVAL_MS = 20_000

type UseChatRealtimeHealthFallbackInput = {
  canUseBackend: boolean
  isRealtimeSupported: boolean
  realtimeThreadId: string | null
  refreshChatSnapshot: () => Promise<void>
  snapshotExists: boolean
}

function documentIsVisible() {
  return typeof document === 'undefined' || document.visibilityState === 'visible'
}

export function useChatRealtimeHealthFallback({
  canUseBackend,
  isRealtimeSupported,
  realtimeThreadId,
  refreshChatSnapshot,
  snapshotExists,
}: UseChatRealtimeHealthFallbackInput) {
  const fallbackInFlightRef = useRef(false)
  const lastFallbackAtRef = useRef(0)
  const lastRealtimeActivityAtRef = useRef(0)

  const reportRealtimeActivity = useCallback(() => {
    lastRealtimeActivityAtRef.current = Date.now()
    fallbackInFlightRef.current = false
  }, [])

  useEffect(() => {
    lastRealtimeActivityAtRef.current = Date.now()
    lastFallbackAtRef.current = 0
    fallbackInFlightRef.current = false
  }, [realtimeThreadId])

  useEffect(() => {
    if (
      !canUseBackend ||
      !isRealtimeSupported ||
      !realtimeThreadId ||
      !snapshotExists
    ) {
      return
    }

    const intervalId = window.setInterval(() => {
      if (!documentIsVisible()) {
        return
      }

      const now = Date.now()
      const realtimeIsStale =
        now - lastRealtimeActivityAtRef.current >= REALTIME_STALE_AFTER_MS

      if (!realtimeIsStale || fallbackInFlightRef.current) {
        return
      }

      if (now - lastFallbackAtRef.current < REALTIME_FALLBACK_MIN_INTERVAL_MS) {
        return
      }

      fallbackInFlightRef.current = true
      lastFallbackAtRef.current = now

      void refreshChatSnapshot()
        .catch(() => {})
        .finally(() => {
          fallbackInFlightRef.current = false
        })
    }, REALTIME_HEALTH_CHECK_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [
    canUseBackend,
    isRealtimeSupported,
    realtimeThreadId,
    refreshChatSnapshot,
    snapshotExists,
  ])

  return { reportRealtimeActivity }
}
```

Important: successful fallback refresh must not update
`lastRealtimeActivityAtRef`. If SSE is still silent, the hook should keep using
the capped fallback interval until a real SSE activity callback arrives.

- [x] **Step 6: Wire health fallback in `ChatPage`**

Create the health hook after `realtimeThreadId` and before
`useChatRealtimeConnection`:

```ts
const { reportRealtimeActivity } = useChatRealtimeHealthFallback({
  canUseBackend,
  isRealtimeSupported,
  realtimeThreadId,
  refreshChatSnapshot,
  snapshotExists: pageState.status === 'ready',
})

useChatRealtimeConnection({
  isMountedRef,
  markBrowserOnline: markChatOnline,
  onRealtimeActivity: reportRealtimeActivity,
  setPageState,
  threadId: realtimeThreadId,
})
```

Do not call customer read sync from this hook. The fallback only refreshes data;
Task 4 remains responsible for viewport-confirmed read sync after render.

- [x] **Step 7: Run focused tests**

Run:

```bash
pnpm --dir frontend exec vitest run \
  src/features/chat/api/chatRealtimeClient.test.ts \
  src/features/chat/pages/useChatRealtimeHealthFallback.test.tsx \
  src/features/chat/pages/useChatRealtimeConnection.test.tsx \
  src/features/chat/pages/ChatPage.test.tsx
```

Expected: pass.

- [x] **Step 8: Focused smoke review checkpoint**

Review this point only:

- silent SSE while visible triggers capped snapshot refresh;
- real SSE activity stops fallback refresh;
- hidden tab does not refresh;
- offline/backend-unavailable state does not poll;
- fallback snapshot merge does not duplicate messages;
- fallback does not mark messages read;
- fallback does not affect unread/push except through the existing
  `useChatSnapshotRefresh` snapshot merge path.

F-CHAT-006 was closed after these checks passed.

Commit:

```bash
git add frontend/src/features/chat
git commit -m "feat: add chat realtime health fallback"
```

## Task 1: Store Chatwoot Public API Identifiers

**Files:**

- Modify: `backend/src/db/schema.ts`
- Create: `backend/drizzle/0007_customer_read_typing_identifiers.sql`
- Modify: `backend/src/modules/tenants/repository.ts`
- Modify: `backend/src/modules/tenants/service.ts`
- Modify: `backend/src/scripts/verify-tenant-chatwoot-connection-core.ts`
- Modify: `backend/src/scripts/configure-tenant-chatwoot-webhook-core.ts`
- Modify tests for these modules.

- [x] **Step 1: Write failing schema/repository tests**

Add tests that prove tenant runtime exposes `portalInboxIdentifier` and thread
records can store `chatwootContactSourceId`. Tenant repository tests must also
prove `updateChatwootPortalInboxIdentifier` trims non-empty identifiers and
throws when the tenant row is missing, matching the existing webhook-secret
update behavior.

Example assertion in tenant service/repository tests:

```ts
expect(tenantContext.chatwoot.portalInboxIdentifier).toBe(
  'api-channel-public-identifier',
)
```

Example assertion in chat thread repository tests:

```ts
expect(thread.chatwootContactSourceId).toBe('portal-contact:source')
```

- [x] **Step 2: Run failing tests**

Run:

```bash
pnpm -C backend vitest run \
  src/modules/tenants/repository.test.ts \
  src/modules/tenants/service.test.ts \
  src/modules/chat-threads/repository.test.ts \
  src/scripts/verify-tenant-chatwoot-connection-core.test.ts \
  src/scripts/configure-tenant-chatwoot-webhook-core.test.ts
```

Expected: tests fail because fields are not implemented.

Done in `feature/phase-chat-public-api-identifiers`: focused backend tests
failed RED before implementation because the tenant runtime identifier,
Chatwoot inbox identifier parser, configure/verify persistence and thread source
id storage did not exist yet.

- [x] **Step 3: Add schema fields and generated migration**

Update `backend/src/db/schema.ts` first:

```ts
chatwootPortalInboxIdentifier: text('chatwoot_portal_inbox_identifier'),
```

in `portalTenants`, and:

```ts
chatwootContactSourceId: text('chatwoot_contact_source_id'),
```

in `portalChatThreads`.

Then generate the migration from the schema:

```bash
pnpm -C backend db:generate -- --name customer_read_typing_identifiers
```

Expected generated SQL content in
`backend/drizzle/0007_customer_read_typing_identifiers.sql` or the next
available Drizzle migration number:

```sql
ALTER TABLE "portal_tenants"
  ADD COLUMN "chatwoot_portal_inbox_identifier" text;
--> statement-breakpoint
ALTER TABLE "portal_chat_threads"
  ADD COLUMN "chatwoot_contact_source_id" text;
--> statement-breakpoint
CREATE INDEX "portal_chat_threads_tenant_source_id_idx"
  ON "portal_chat_threads" USING btree ("tenant_id","chatwoot_contact_source_id")
  WHERE "portal_chat_threads"."chatwoot_contact_source_id" is not null;
```

The implementation commit must include the generated SQL file, the matching
`backend/drizzle/meta/*_snapshot.json` file and the new
`backend/drizzle/meta/_journal.json` entry. Do not ship a SQL-only migration.

Done in `feature/phase-chat-public-api-identifiers`: Drizzle generated
`backend/drizzle/0007_customer_read_typing_identifiers.sql`,
`backend/drizzle/meta/0007_snapshot.json` and the matching journal entry from
the schema change.

- [x] **Step 4: Parse `inbox_identifier` from Chatwoot inbox lookup**

In `backend/src/integrations/chatwoot/client.ts`, extend
`ChatwootPortalInboxRouting`:

```ts
export type ChatwootPortalInboxRouting = {
  channelType: string | null
  id: number
  inboxIdentifier: string | null
  lockToSingleConversation: boolean
  webhookSecret: string | null
  webhookUrl: string | null
}
```

In `mapPortalInboxRouting`, read:

```ts
const inboxIdentifier = readTrimmedString(payload.inbox_identifier)
```

and return it.

- [x] **Step 5: Persist tenant identifier in verify/configure scripts**

Add repository method:

```ts
async updateChatwootPortalInboxIdentifier({
  chatwootPortalInboxIdentifier,
  tenantId,
  updatedAt = new Date(),
}: {
  chatwootPortalInboxIdentifier: string
  tenantId: number
  updatedAt?: Date
}) {
  const [tenant] = await db
    .update(portalTenants)
    .set({
      chatwootPortalInboxIdentifier: normalizeNonEmptyString(
        chatwootPortalInboxIdentifier,
        'chatwootPortalInboxIdentifier',
      ),
      updatedAt,
    })
    .where(eq(portalTenants.id, tenantId))
    .returning()

  if (!tenant) {
    throw new Error('Failed to update tenant Chatwoot portal inbox identifier.')
  }

  return tenant
}
```

Extend `ChatwootPortalInboxWebhook` so `configurePortalInboxWebhook()` also
returns:

```ts
inboxIdentifier: string | null
```

Call `updateChatwootPortalInboxIdentifier` after
`verifyPortalInboxConnection()` or `configurePortalInboxWebhook()` returns a
non-empty `inboxIdentifier`.

- [x] **Step 6: Persist thread source id**

Extend `PortalChatThreadRecord`:

```ts
chatwootContactSourceId: string | null
```

Add repository method:

```ts
async updateThreadContactSourceId({
  chatwootContactSourceId,
  id,
  now,
}: {
  chatwootContactSourceId: string
  id: number
  now: Date
}) {
  const [thread] = await db
    .update(portalChatThreads)
    .set({
      chatwootContactSourceId,
      updatedAt: now,
    })
    .where(
      and(
        eq(portalChatThreads.tenantId, tenantId),
        eq(portalChatThreads.id, id),
      ),
    )
    .returning(threadSelection)

  return thread ? mapThread(thread) : null
}
```

In `chat-threads/runtime.ts`, after
`ensurePortalContactInboxSourceId(targetChatwootContactId)` returns a source id,
persist it on the locked thread before creating/reusing the conversation.

- [x] **Step 7: Run tests**

Run the same command from Step 2.

Expected: pass.

- [x] **Step 8: Smoke review checkpoint**

Review:

- tenant identifier never goes to browser;
- source id never goes to browser;
- nullable existing rows fail closed until verify/bootstrap stores identifiers;
- no Chatwoot core files are touched.

Done in `feature/phase-chat-public-api-identifiers`:

- `portalInboxIdentifier` is present only in backend runtime tenant context and
  is not returned by `getPublicTenantContext`.
- `chatwootContactSourceId` is stored on backend thread records and is not
  referenced in frontend code.
- Both new columns are nullable; later read/typing tasks must treat missing
  values as `not_configured` instead of guessing.
- The diff touches only this portal repository; Chatwoot core remains external.

Commit:

```bash
git add backend
git commit -m "feat: store chatwoot public api identifiers"
```

## Task 2: Add Chatwoot Public Conversation Event Client

**Files:**

- Create: `backend/src/integrations/chatwoot/publicConversationEvents.ts`
- Create: `backend/src/integrations/chatwoot/publicConversationEvents.test.ts`
- Modify: `backend/src/integrations/chatwoot/client.ts`
- Modify: `backend/src/integrations/chatwoot/client.test.ts`

- [ ] **Step 1: Write failing public client tests**

Create `backend/src/integrations/chatwoot/publicConversationEvents.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

import { ChatwootClientRequestError } from './errors.js'
import { createPublicConversationEventsClient } from './publicConversationEvents.js'

function createJsonResponse(status = 200) {
  return new Response(status === 200 ? '{}' : '{"error":"not_found"}', {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

describe('createPublicConversationEventsClient', () => {
  it('posts update_last_seen to the Chatwoot public API path', async () => {
    const fetchFn = vi.fn().mockResolvedValue(createJsonResponse())
    const client = createPublicConversationEventsClient({
      baseUrl: 'https://chatwoot.example.test',
      fetchFn,
      requestTimeoutMs: 10_000,
    })

    await client.updateLastSeen({
      contactIdentifier: 'portal-contact:source',
      conversationDisplayId: 12,
      inboxIdentifier: 'api-inbox-token',
    })

    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      'https://chatwoot.example.test/public/api/v1/inboxes/api-inbox-token/contacts/portal-contact%3Asource/conversations/12/update_last_seen',
    )
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' })
  })

  it('posts toggle_typing with on and off statuses', async () => {
    const fetchFn = vi.fn().mockResolvedValue(createJsonResponse())
    const client = createPublicConversationEventsClient({
      baseUrl: 'https://chatwoot.example.test',
      fetchFn,
      requestTimeoutMs: 10_000,
    })

    await client.toggleTyping({
      contactIdentifier: 'portal-contact:source',
      conversationDisplayId: 12,
      inboxIdentifier: 'api-inbox-token',
      typingStatus: 'on',
    })

    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      'https://chatwoot.example.test/public/api/v1/inboxes/api-inbox-token/contacts/portal-contact%3Asource/conversations/12/toggle_typing',
    )
    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toEqual({
      typing_status: 'on',
    })
  })

  it('throws a request error for missing public identifiers', async () => {
    const client = createPublicConversationEventsClient({
      baseUrl: 'https://chatwoot.example.test',
      fetchFn: vi.fn(),
      requestTimeoutMs: 10_000,
    })

    await expect(
      client.updateLastSeen({
        contactIdentifier: '',
        conversationDisplayId: 12,
        inboxIdentifier: 'api-inbox-token',
      }),
    ).rejects.toBeInstanceOf(ChatwootClientRequestError)
  })

  it('uses the default Chatwoot request timeout when no override is supplied', async () => {
    const fetchFn = vi.fn().mockResolvedValue(createJsonResponse())
    const client = createPublicConversationEventsClient({
      baseUrl: 'https://chatwoot.example.test',
      fetchFn,
    })

    await client.updateLastSeen({
      contactIdentifier: 'portal-contact:source',
      conversationDisplayId: 12,
      inboxIdentifier: 'api-inbox-token',
    })

    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run failing test**

Run:

```bash
pnpm -C backend vitest run src/integrations/chatwoot/publicConversationEvents.test.ts
```

Expected: fail because the file does not exist.

- [ ] **Step 3: Implement public event client**

Create `backend/src/integrations/chatwoot/publicConversationEvents.ts`:

```ts
import { ChatwootClientRequestError } from './errors.js'
import {
  createChatwootFetch,
  normalizeChatwootRequestTimeoutMs,
} from './request.js'

type PublicConversationEventsClientOptions = {
  baseUrl: string
  fetchFn?: typeof fetch
  requestTimeoutMs?: number | undefined
}

type PublicConversationInput = {
  contactIdentifier: string
  conversationDisplayId: number
  inboxIdentifier: string
}

function normalizeIdentifier(value: string, label: string) {
  const normalized = value.trim()

  if (!normalized) {
    throw new ChatwootClientRequestError(
      `Chatwoot public ${label} is required.`,
    )
  }

  return normalized
}

function normalizeConversationDisplayId(value: number) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ChatwootClientRequestError(
      'Chatwoot public conversation display id is required.',
    )
  }

  return value
}

function buildConversationUrl({
  action,
  baseUrl,
  contactIdentifier,
  conversationDisplayId,
  inboxIdentifier,
}: PublicConversationInput & {
  action: 'toggle_typing' | 'update_last_seen'
  baseUrl: string
}) {
  const url = new URL(
    `/public/api/v1/inboxes/${encodeURIComponent(
      normalizeIdentifier(inboxIdentifier, 'inbox identifier'),
    )}/contacts/${encodeURIComponent(
      normalizeIdentifier(contactIdentifier, 'contact identifier'),
    )}/conversations/${normalizeConversationDisplayId(conversationDisplayId)}/${action}`,
    baseUrl,
  )

  return url
}

export function createPublicConversationEventsClient({
  baseUrl,
  fetchFn,
  requestTimeoutMs,
}: PublicConversationEventsClientOptions) {
  const normalizedRequestTimeoutMs =
    normalizeChatwootRequestTimeoutMs(requestTimeoutMs)
  const fetchChatwoot = createChatwootFetch({
    fetchFn,
    requestTimeoutMs: normalizedRequestTimeoutMs,
  })

  async function postPublicConversationEvent(
    input: PublicConversationInput & {
      body?: Record<string, unknown>
      requestName: string
      urlAction: 'toggle_typing' | 'update_last_seen'
    },
  ) {
    const request = await fetchChatwoot(
      buildConversationUrl({
        ...input,
        action: input.urlAction,
        baseUrl,
      }),
      `${input.requestName} is unavailable.`,
      {
        body: input.body ? JSON.stringify(input.body) : undefined,
        headers: input.body
          ? {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            }
          : { Accept: 'application/json' },
        method: 'POST',
      },
    )

    try {
      if (!request.response.ok) {
        throw new ChatwootClientRequestError(
          `${input.requestName} failed with status ${request.response.status}.`,
        )
      }
    } finally {
      request.clearTimeout()
    }
  }

  return {
    updateLastSeen(input: PublicConversationInput) {
      return postPublicConversationEvent({
        ...input,
        requestName: 'Chatwoot public update last seen',
        urlAction: 'update_last_seen',
      })
    },

    toggleTyping(
      input: PublicConversationInput & { typingStatus: 'off' | 'on' },
    ) {
      return postPublicConversationEvent({
        ...input,
        body: { typing_status: input.typingStatus },
        requestName: 'Chatwoot public toggle typing',
        urlAction: 'toggle_typing',
      })
    },
  }
}
```

- [ ] **Step 4: Expose methods through tenant Chatwoot client**

In `backend/src/integrations/chatwoot/client.ts`, instantiate the public client
after `resolvedConfig` is available and expose:

```ts
async updatePublicConversationLastSeen(input: {
  contactIdentifier: string
  conversationDisplayId: number
  inboxIdentifier: string
}) {
  const resolvedConfig = assertConfigured()
  return createPublicConversationEventsClient({
    baseUrl: resolvedConfig.baseUrl,
    fetchFn,
    requestTimeoutMs,
  }).updateLastSeen(input)
},
```

and:

```ts
async togglePublicConversationTyping(input: {
  contactIdentifier: string
  conversationDisplayId: number
  inboxIdentifier: string
  typingStatus: 'off' | 'on'
}) {
  const resolvedConfig = assertConfigured()
  return createPublicConversationEventsClient({
    baseUrl: resolvedConfig.baseUrl,
    fetchFn,
    requestTimeoutMs,
  }).toggleTyping(input)
},
```

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm -C backend vitest run \
  src/integrations/chatwoot/publicConversationEvents.test.ts \
  src/integrations/chatwoot/client.test.ts
```

Expected: pass.

- [ ] **Step 6: Smoke review checkpoint**

Review:

- public API identifiers are URL-encoded;
- browser still does not call Chatwoot directly;
- failed public event calls are errors at backend service boundary;
- no API token is sent to public API routes.

Commit:

```bash
git add backend/src/integrations/chatwoot
git commit -m "feat: add chatwoot public conversation events client"
```

## Task 3: Add Customer Read Sync Backend

**Files:**

- Create: `backend/src/modules/chat-presence/service.ts`
- Create: `backend/src/modules/chat-presence/service.test.ts`
- Create: `backend/src/modules/chat-presence/routes.ts`
- Create: `backend/src/modules/chat-presence/routes.test.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/modules/chat-threads/runtime.ts`
- Modify: `backend/src/modules/chat-threads/types.ts`

- [ ] **Step 1: Write failing service tests**

Create tests for these cases:

- private ready thread calls Chatwoot `updatePublicConversationLastSeen`;
- group thread returns `skipped_group_thread`;
- missing `portalInboxIdentifier` returns `not_configured`;
- missing source id resolves and stores it;
- repeated calls inside throttle window are skipped;
- Chatwoot request error returns `chatwoot_unavailable`.

Expected service result shape:

```ts
type ChatCustomerReadSyncResult =
  | { result: 'synced' }
  | { result: 'skipped'; reason: 'group_thread' | 'throttled' }
  | {
      reason:
        | 'chatwoot_unavailable'
        | 'conversation_missing'
        | 'not_configured'
        | 'thread_access_denied'
      result: 'unavailable'
    }
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
pnpm -C backend vitest run src/modules/chat-presence/service.test.ts
```

Expected: fail because service does not exist.

- [ ] **Step 3: Implement service contract**

Create `backend/src/modules/chat-presence/service.ts`:

```ts
import { ChatwootClientRequestError } from '../../integrations/chatwoot/client.js'

const READ_SYNC_THROTTLE_MS = 5_000

type ReadThrottleKey = `${number}:${number}:${string}`

export type ChatPresenceServiceOptions = {
  chatThreadsService: {
    getCurrentUserThreadContext: (input: {
      threadId?: string
      userId: number
    }) => Promise<{
      chatwootContactSourceId: string | null
      chatwootConversation: { id: number; inboxId: number } | null
      portalChatThreadId: number | null
      reason: string
      result: string
      targetChatwootContactId: number | null
      threadType: 'group' | 'private' | null
    }>
  }
  chatThreadsRepository: {
    updateThreadContactSourceId: (input: {
      chatwootContactSourceId: string
      id: number
      now: Date
    }) => Promise<unknown>
  }
  chatwoot: {
    portalInboxIdentifier: string | null
    updatePublicConversationLastSeen: (input: {
      contactIdentifier: string
      conversationDisplayId: number
      inboxIdentifier: string
    }) => Promise<void>
    findContactPortalInboxSourceId: (
      contactId: number,
    ) => Promise<string | null>
  }
  now?: () => Date
  tenantId: number
}

function buildReadThrottleKey({
  tenantId,
  threadId,
  userId,
}: {
  tenantId: number
  threadId: string
  userId: number
}): ReadThrottleKey {
  return `${tenantId}:${userId}:${threadId}`
}

export function createChatPresenceService({
  chatThreadsRepository,
  chatThreadsService,
  chatwoot,
  now = () => new Date(),
  tenantId,
}: ChatPresenceServiceOptions) {
  const lastReadSyncAtByKey = new Map<ReadThrottleKey, number>()

  async function resolveSourceId({
    contactId,
    portalChatThreadId,
  }: {
    contactId: number
    portalChatThreadId: number
  }) {
    const sourceId = await chatwoot.findContactPortalInboxSourceId(contactId)

    if (!sourceId) {
      return null
    }

    await chatThreadsRepository.updateThreadContactSourceId({
      chatwootContactSourceId: sourceId,
      id: portalChatThreadId,
      now: now(),
    })

    return sourceId
  }

  return {
    async markCurrentUserThreadRead({
      threadId,
      userId,
    }: {
      threadId: string
      userId: number
    }) {
      const throttleKey = buildReadThrottleKey({ tenantId, threadId, userId })
      const currentTimeMs = now().getTime()
      const lastSyncedAt = lastReadSyncAtByKey.get(throttleKey)

      if (
        lastSyncedAt !== undefined &&
        currentTimeMs - lastSyncedAt < READ_SYNC_THROTTLE_MS
      ) {
        return { reason: 'throttled', result: 'skipped' as const }
      }

      const context = await chatThreadsService.getCurrentUserThreadContext({
        threadId,
        userId,
      })

      if (context.result !== 'ready' || !context.chatwootConversation) {
        return {
          reason:
            context.reason === 'thread_access_denied'
              ? 'thread_access_denied'
              : 'conversation_missing',
          result: 'unavailable' as const,
        }
      }

      if (context.threadType !== 'private') {
        return { reason: 'group_thread', result: 'skipped' as const }
      }

      if (!chatwoot.portalInboxIdentifier) {
        return { reason: 'not_configured', result: 'unavailable' as const }
      }

      if (!context.targetChatwootContactId || !context.portalChatThreadId) {
        return {
          reason: 'conversation_missing',
          result: 'unavailable' as const,
        }
      }

      try {
        const sourceId =
          context.chatwootContactSourceId ??
          (await resolveSourceId({
            contactId: context.targetChatwootContactId,
            portalChatThreadId: context.portalChatThreadId,
          }))

        if (!sourceId) {
          return { reason: 'not_configured', result: 'unavailable' as const }
        }

        await chatwoot.updatePublicConversationLastSeen({
          contactIdentifier: sourceId,
          conversationDisplayId: context.chatwootConversation.id,
          inboxIdentifier: chatwoot.portalInboxIdentifier,
        })
        lastReadSyncAtByKey.set(throttleKey, currentTimeMs)

        return { result: 'synced' as const }
      } catch (error) {
        if (error instanceof ChatwootClientRequestError) {
          return {
            reason: 'chatwoot_unavailable',
            result: 'unavailable' as const,
          }
        }

        throw error
      }
    },
  }
}
```

During implementation, use the actual project `CurrentUserChatThreadContext`
type instead of the structural test shape above.

- [ ] **Step 4: Add authenticated route**

Create route:

```text
POST /api/chat/threads/:threadId/read
```

Route behavior:

- auth required;
- thread id validated through existing thread service;
- route body is empty;
- `synced`, `skipped` and `unavailable` all return HTTP `204`;
- only authentication/tenant failures return normal errors.

This route is not user-facing UI. If Chatwoot is temporarily unavailable, the
next visible-bottom event can catch up.

- [ ] **Step 5: Register route in `backend/src/app.ts`**

Wire route construction with current tenant Chatwoot context and repositories.

- [ ] **Step 6: Run backend tests**

Run:

```bash
pnpm -C backend vitest run \
  src/modules/chat-presence/service.test.ts \
  src/modules/chat-presence/routes.test.ts \
  src/modules/chat-threads/service.test.ts \
  src/modules/chat-messages/routes.test.ts
```

Expected: pass.

- [ ] **Step 7: Smoke review checkpoint**

Review:

- group read is skipped, not silently treated as "read by everyone";
- route is same-origin and authenticated;
- read sync does not affect portal unread/push counters;
- read sync does not run for media/search/older-history endpoints.

Commit:

```bash
git add backend/src/modules/chat-presence backend/src/modules/chat-threads backend/src/app.ts
git commit -m "feat: sync portal customer reads to chatwoot"
```

## Task 4: Add Viewport-Driven Frontend Read Sync

Prerequisite satisfied: Task 0 is complete and F-CHAT-006 is closed. Read sync
depends on messages being rendered from either healthy realtime or bounded
fallback snapshots.

**Files:**

- Modify: `frontend/src/features/chat/api/chatClient.ts`
- Create: `frontend/src/features/chat/pages/useChatReadSync.ts`
- Create: `frontend/src/features/chat/pages/useChatReadSync.test.tsx`
- Modify: `frontend/src/features/chat/components/ChatTranscript.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.test.tsx`

- [ ] **Step 1: Add failing hook tests**

Cover:

- calls mark-read when latest transcript is visible near bottom;
- does not call when history fragment is open;
- does not call when offline/backend unavailable;
- debounces repeated visible events;
- calls again when a later agent message arrives while still near bottom.

- [ ] **Step 2: Add API client method**

In `chatClient.ts`:

```ts
export async function markChatThreadRead(threadId: string) {
  await request<void>(`/chat/threads/${encodeURIComponent(threadId)}/read`, {
    method: 'POST',
    networkErrorMessage:
      'Не удалось синхронизировать прочтение чата. Попробуйте еще раз.',
  })
}
```

- [ ] **Step 3: Implement hook**

Create `useChatReadSync.ts`:

```ts
import { useCallback, useRef } from 'react'

const READ_SYNC_DEBOUNCE_MS = 5_000

type VisibleBoundary = {
  latestVisibleAgentMessageId: number | null
}

export function useChatReadSync({
  canUseBackend,
  historyFragmentIsOpen,
  markRead,
  selectedThreadId,
}: {
  canUseBackend: boolean
  historyFragmentIsOpen: boolean
  markRead: (threadId: string) => Promise<void>
  selectedThreadId: string | null
}) {
  const lastSyncByBoundaryRef = useRef(new Map<string, number>())

  return useCallback((boundary: VisibleBoundary) => {
    if (!canUseBackend || historyFragmentIsOpen || !selectedThreadId) {
      return
    }

    if (boundary.latestVisibleAgentMessageId === null) {
      return
    }

    const syncKey = `${selectedThreadId}:${boundary.latestVisibleAgentMessageId}`
    const now = Date.now()
    const lastSyncAt = lastSyncByBoundaryRef.current.get(syncKey)

    if (lastSyncAt !== undefined && now - lastSyncAt < READ_SYNC_DEBOUNCE_MS) {
      return
    }

    lastSyncByBoundaryRef.current.set(syncKey, now)
    void markRead(selectedThreadId).catch(() => {
      lastSyncByBoundaryRef.current.delete(syncKey)
    })
  }, [canUseBackend, historyFragmentIsOpen, markRead, selectedThreadId])
}
```

- [ ] **Step 4: Make transcript report latest-visible events**

Add prop to `ChatTranscript`:

```ts
onLatestMessagesVisible?: (boundary: {
  latestVisibleAgentMessageId: number | null
}) => void
```

Call it only when:

- no history fragment controls are active;
- `messages` contains the latest transcript, not search/history context;
- `isTranscriptNearBottom(scrollElement)` returns true after layout/resize;
- the latest message boundary changed or scroll moved back to bottom.

Compute the boundary from the latest visible portal-incoming message:

```ts
const latestVisibleAgentMessageId =
  messages.findLast((message) => message.direction === 'incoming')?.id ?? null

onLatestMessagesVisible?.({ latestVisibleAgentMessageId })
```

Use existing `captureTranscriptScrollSnapshot` and
`shouldAutoFollowNewMessagesRef` instead of introducing a second scroll model.

- [ ] **Step 5: Wire in `ChatPage`**

In `ChatPage.tsx`:

```ts
const handleLatestMessagesVisible = useChatReadSync({
  canUseBackend,
  historyFragmentIsOpen: historyFragment !== null,
  markRead: markChatThreadRead,
  selectedThreadId: pageState.selectedThreadId,
})
```

Pass `handleLatestMessagesVisible` to `ChatTranscript`.

- [ ] **Step 6: Run frontend tests**

Run:

```bash
pnpm -C frontend vitest run \
  src/features/chat/pages/useChatReadSync.test.tsx \
  src/features/chat/pages/ChatPage.test.tsx
```

Expected: pass.

- [ ] **Step 7: Smoke review checkpoint**

Review:

- offline cached boot does not call mark-read;
- search/history context does not call mark-read;
- reading old history does not call mark-read for new messages;
- read sync failure does not show a confusing user-visible error.

Commit:

```bash
git add frontend/src/features/chat
git commit -m "feat: mark visible chat messages read"
```

## Task 5: Portal User Typing To Chatwoot Agent

**Files:**

- Modify: `backend/src/modules/chat-presence/service.ts`
- Modify: `backend/src/modules/chat-presence/service.test.ts`
- Modify: `backend/src/modules/chat-presence/routes.ts`
- Modify: `backend/src/modules/chat-presence/routes.test.ts`
- Modify: `frontend/src/features/chat/api/chatClient.ts`
- Create: `frontend/src/features/chat/pages/useChatTypingSync.ts`
- Create: `frontend/src/features/chat/pages/useChatTypingSync.test.tsx`
- Modify: `frontend/src/features/chat/components/MessageComposer.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.tsx`

- [ ] **Step 1: Add backend typing tests**

Cover:

- private and group ready threads call Chatwoot `togglePublicConversationTyping`;
- missing identifiers return `204` with no user-facing error;
- missing source id prerequisites return `204` with no user-facing error;
- Chatwoot request failures return `204` with no user-facing error;
- repeated `on` events are throttled;
- `off` is sent after draft clears;
- offline/backend unavailable frontend does not call route.

- [ ] **Step 2: Add backend route**

Route:

```text
POST /api/chat/threads/:threadId/typing
```

Body:

```ts
const typingRequestSchema = z
  .object({
    typingStatus: z.enum(['off', 'on']),
  })
  .strict()
```

Route returns `204` for synced/skipped/unavailable, because typing is transient.

- [ ] **Step 3: Add service method**

In `chat-presence/service.ts`, add:

```ts
import { ChatwootClientRequestError } from '../../integrations/chatwoot/errors.js'

const TYPING_ON_THROTTLE_MS = 3_000

async setCurrentUserThreadTyping({
  threadId,
  typingStatus,
  userId,
}: {
  threadId: string
  typingStatus: 'off' | 'on'
  userId: number
}) {
  const context = await chatThreadsService.getCurrentUserThreadContext({
    threadId,
    userId,
  })

  if (context.result !== 'ready' || !context.chatwootConversation) {
    return { reason: 'conversation_missing', result: 'unavailable' as const }
  }

  if (!chatwoot.portalInboxIdentifier) {
    return { reason: 'not_configured', result: 'unavailable' as const }
  }

  if (
    context.portalChatThreadId === null ||
    context.targetChatwootContactId === null
  ) {
    return { reason: 'source_id_prerequisites_missing', result: 'unavailable' as const }
  }

  try {
    const sourceId =
      context.chatwootContactSourceId ??
      (await resolveSourceId({
        contactId: context.targetChatwootContactId,
        portalChatThreadId: context.portalChatThreadId,
      }))

    if (!sourceId) {
      return { reason: 'source_id_missing', result: 'unavailable' as const }
    }

    await chatwoot.togglePublicConversationTyping({
      contactIdentifier: sourceId,
      conversationDisplayId: context.chatwootConversation.id,
      inboxIdentifier: chatwoot.portalInboxIdentifier,
      typingStatus,
    })
  } catch (error) {
    if (error instanceof ChatwootClientRequestError) {
      return { reason: 'chatwoot_unavailable', result: 'unavailable' as const }
    }

    throw error
  }

  return { result: 'synced' as const }
}
```

Use the same real context null checks as Task 3. The route still returns `204`
for every `result: 'unavailable'` response because typing is transient and
should fail closed.

- [ ] **Step 4: Add frontend API method**

In `chatClient.ts`:

```ts
export async function setChatThreadTyping({
  threadId,
  typingStatus,
}: {
  threadId: string
  typingStatus: 'off' | 'on'
}) {
  await request<void>(`/chat/threads/${encodeURIComponent(threadId)}/typing`, {
    body: { typingStatus },
    method: 'POST',
    networkErrorMessage: 'Не удалось синхронизировать статус набора сообщения.',
  })
}
```

- [ ] **Step 5: Implement typing hook**

Create `useChatTypingSync.ts`:

```ts
import { useCallback, useEffect, useRef } from 'react'

const TYPING_IDLE_OFF_MS = 2_500
const TYPING_ON_RESEND_MS = 3_000

export function useChatTypingSync({
  canUseBackend,
  selectedThreadId,
  setTyping,
}: {
  canUseBackend: boolean
  selectedThreadId: string | null
  setTyping: (input: {
    threadId: string
    typingStatus: 'off' | 'on'
  }) => Promise<void>
}) {
  const offTimerRef = useRef<number | null>(null)
  const lastOnSentAtRef = useRef(0)
  const typingThreadRef = useRef<string | null>(null)

  const sendTypingOff = useCallback(() => {
    const threadId = typingThreadRef.current

    if (!threadId) {
      return
    }

    typingThreadRef.current = null
    void setTyping({ threadId, typingStatus: 'off' }).catch(() => {})
  }, [setTyping])

  const handleDraftChanged = useCallback(
    (draft: string) => {
      if (!canUseBackend || !selectedThreadId || !draft.trim()) {
        sendTypingOff()
        return
      }

      const now = Date.now()
      typingThreadRef.current = selectedThreadId

      if (now - lastOnSentAtRef.current >= TYPING_ON_RESEND_MS) {
        lastOnSentAtRef.current = now
        void setTyping({
          threadId: selectedThreadId,
          typingStatus: 'on',
        }).catch(() => {})
      }

      if (offTimerRef.current !== null) {
        window.clearTimeout(offTimerRef.current)
      }

      offTimerRef.current = window.setTimeout(sendTypingOff, TYPING_IDLE_OFF_MS)
    },
    [canUseBackend, selectedThreadId, sendTypingOff, setTyping],
  )

  useEffect(() => {
    return () => {
      if (offTimerRef.current !== null) {
        window.clearTimeout(offTimerRef.current)
      }
      sendTypingOff()
    }
  }, [sendTypingOff])

  return { handleDraftChanged, sendTypingOff }
}
```

- [ ] **Step 6: Wire composer**

Add prop to `MessageComposer`:

```ts
onDraftTypingChange?: (draft: string) => void
```

Call it from `updateDraft(nextDraft)` after state validation. Call
`sendTypingOff` after successful send, cancel reply, thread change and unmount.

- [ ] **Step 7: Run tests**

Run:

```bash
pnpm -C backend vitest run src/modules/chat-presence
pnpm -C frontend vitest run \
  src/features/chat/pages/useChatTypingSync.test.tsx \
  src/features/chat/pages/ChatPage.test.tsx
```

Expected: pass.

- [ ] **Step 8: Smoke review checkpoint**

Review:

- browser never calls Chatwoot directly;
- typing is transient and never stored as read;
- `off` is sent on idle/unmount/thread switch;
- group typing is documented as generic group contact typing.

Commit:

```bash
git add backend/src/modules/chat-presence frontend/src/features/chat
git commit -m "feat: sync portal typing to chatwoot"
```

## Task 6: Chatwoot Agent Typing To Portal User

Prerequisite satisfied: Task 0 is complete and F-CHAT-006 is closed. Agent
typing reaches the portal through the same SSE health boundary.

**Files:**

- Modify: `backend/src/modules/chat-realtime/hub.ts`
- Modify: `backend/src/modules/chat-realtime/routes.test.ts`
- Modify: `backend/src/modules/chatwoot-webhooks/service.ts`
- Modify: `backend/src/modules/chatwoot-webhooks/service.test.ts`
- Modify: `frontend/src/features/chat/api/chatRealtimeClient.ts`
- Modify: `frontend/src/features/chat/pages/useChatRealtimeConnection.ts`
- Create: `frontend/src/features/chat/components/AgentTypingIndicator.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.tsx`
- Modify frontend tests.

- [ ] **Step 1: Write failing webhook tests**

Add tests for:

- signed `conversation_typing_on` for mapped conversation publishes realtime
  typing event;
- signed `conversation_typing_off` clears it;
- private typing events with `is_private: true` are ignored;
- unsupported typing payload without conversation id is unroutable;
- typing does not record unread and does not trigger push.
- frontend ignores typing events for a stale/mismatched thread and clears typing
  state immediately on selected-thread changes.

- [ ] **Step 2: Extend realtime event type**

In `chat-realtime/hub.ts`:

```ts
export type ChatTypingEvent = {
  actor: 'agent'
  isTyping: boolean
  threadId: string
}

export type ChatRealtimeEvent =
  | { data: ChatMessagesSnapshot; type: 'messages' }
  | { data: ChatMessagesSnapshot; type: 'chat-state' }
  | { data: ChatTypingEvent; type: 'typing' }
```

Add:

```ts
publishThreadTyping({
  isTyping,
  tenantId,
  threadId,
}: {
  isTyping: boolean
  tenantId: number
  threadId: string
}) {
  const subscriptions = subscriptionsByThreadKey.get(
    buildThreadKey({ tenantId, threadId }),
  )

  if (!subscriptions) {
    return 0
  }

  let delivered = 0

  for (const subscription of subscriptions) {
    subscription.send({
      data: { actor: 'agent', isTyping, threadId },
      type: 'typing',
    })
    delivered += 1
  }

  return delivered
}
```

- [ ] **Step 3: Accept typing webhooks**

In `chatwoot-webhooks/service.ts`:

```ts
const SUPPORTED_TYPING_EVENTS = new Set([
  'conversation_typing_on',
  'conversation_typing_off',
])
```

Typing flow:

- validate signature and tenant invariants exactly like message webhooks;
- record delivery with `accepted` after mapping is found;
- skip typing events where Chatwoot payload has `is_private === true`;
- do not call `chatMessagesService.getCurrentUserChatMessages`;
- call `realtimeHub.publishThreadTyping`.

Do not reuse the current message helper that checks `payload.private`; Chatwoot
typing webhooks use `is_private`:

```ts
function readIsPrivateTyping(payload: Record<string, unknown>) {
  return payload.is_private === true
}
```

- [ ] **Step 4: Add frontend realtime typing handling**

In `chatRealtimeClient.ts`, add:

```ts
type ChatTypingEvent = {
  actor: 'agent'
  isTyping: boolean
  threadId: string
}
```

Add `onTyping` to `OpenChatRealtimeInput`, listen to:

```ts
eventSource.addEventListener('typing', (event) => {
  onTyping(JSON.parse((event as MessageEvent<string>).data) as ChatTypingEvent)
})
```

- [ ] **Step 5: Add indicator component**

Create `AgentTypingIndicator.tsx`:

```tsx
export function AgentTypingIndicator({ isVisible }: { isVisible: boolean }) {
  if (!isVisible) {
    return null
  }

  return (
    <div
      aria-label="Идет набор сообщения"
      aria-live="polite"
      className="px-4 pb-2 sm:px-6"
      role="status"
    >
      <div aria-hidden="true" className="flex h-6 items-center gap-1">
        <span
          className="h-1.5 w-1.5 rounded-full bg-slate-400 motion-safe:animate-bounce"
          style={{ animationDelay: '-0.2s' }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full bg-slate-400 motion-safe:animate-bounce"
          style={{ animationDelay: '-0.1s' }}
        />
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 motion-safe:animate-bounce" />
      </div>
    </div>
  )
}
```

Place it above the composer, not inside message bubbles. Do not create a fake
agent message. Do not render visible typing text or agent names in the portal
indicator.

- [ ] **Step 6: Add typing timeout fallback and thread cleanup**

In `useChatRealtimeConnection` or a small hook, clear agent typing after
`4_000ms` if `conversation_typing_off` is not received. Store typing state with
the `threadId` that produced it, ignore mismatched events and clear immediately
when `selectedThreadId` or the active realtime thread changes.

Expected state logic:

```ts
type AgentTypingState = {
  isTyping: boolean
  threadId: string | null
}

const [agentTyping, setAgentTyping] = useState<AgentTypingState>({
  isTyping: false,
  threadId: null,
})

if (event.threadId !== selectedThreadId) {
  return
}

if (event.isTyping) {
  setAgentTyping({ isTyping: true, threadId: event.threadId })
  resetAutoClearTimer()
} else {
  setAgentTyping({ isTyping: false, threadId: null })
  clearAutoClearTimer()
}

useEffect(() => {
  setAgentTyping({ isTyping: false, threadId: null })
  clearAutoClearTimer()
}, [selectedThreadId, realtimeThreadId])
```

- [ ] **Step 7: Run tests**

Run:

```bash
pnpm -C backend vitest run \
  src/modules/chatwoot-webhooks/service.test.ts \
  src/modules/chat-realtime/routes.test.ts
pnpm -C frontend vitest run \
  src/features/chat/pages/ChatPage.test.tsx
```

Expected: pass.

- [ ] **Step 8: Smoke review checkpoint**

Review:

- typing does not trigger push;
- typing does not modify unread;
- typing does not refresh full snapshots;
- private agent notes do not appear as typing for portal users.

Commit:

```bash
git add backend/src/modules/chat-realtime backend/src/modules/chatwoot-webhooks frontend/src/features/chat
git commit -m "feat: show chatwoot agent typing in portal"
```

## Task 7: Runtime And E2E Smoke

**Files:**

- Create: `tests/e2e/chat-customer-read-and-typing.spec.ts`
- Modify e2e test helpers to sign Chatwoot webhook payloads and expose the
  currently mapped portal thread id.
- Modify: `docs/product/chat-message-send-ui-scenarios.md`

- [ ] **Step 1: Add mocked-webhook e2e**

Create e2e that:

1. opens portal chat;
2. posts signed `conversation_typing_on` webhook for the mapped conversation;
3. asserts a textless animated three-dot typing indicator appears;
4. posts signed `conversation_typing_off`;
5. asserts indicator disappears;
6. asserts no extra message bubble appears.

- [ ] **Step 2: Add stale realtime fallback e2e**

E2E should simulate or stub a silent realtime connection while backend message
fetch still works:

1. open portal chat with a ready latest snapshot;
2. prevent new SSE `messages` events from reaching the page;
3. make `/api/chat/messages` return one newer agent message;
4. advance timers past the stale realtime window;
5. assert the newer message appears through fallback refresh;
6. assert it appears once even if a delayed realtime `messages` event later
   contains the same message id.

- [ ] **Step 3: Add mark-read e2e**

E2E should stub/observe backend Chatwoot public call where possible. If full
Chatwoot runtime is available, verify that opening latest private thread near
bottom calls:

```text
POST /public/api/v1/inboxes/:inbox_identifier/contacts/:source_id/conversations/:display_id/update_last_seen
```

and does not call it when:

- app opens offline cache;
- search/history fragment is active;
- user is scrolled away from the bottom.

- [ ] **Step 4: Add typing-to-agent e2e**

With local Chatwoot running, type in portal composer and verify backend calls:

```text
POST /public/api/v1/inboxes/:inbox_identifier/contacts/:source_id/conversations/:display_id/toggle_typing
```

for `on`, then `off`.

- [ ] **Step 5: Update scenario docs**

In `docs/product/chat-message-send-ui-scenarios.md`, replace old
`conversation_agent_read` scenarios with:

- customer read to agent;
- portal user typing to agent;
- agent typing to portal user;
- stale realtime fallback before read/typing;
- offline/history no-read guardrail.

- [ ] **Step 6: Run targeted checks**

Run:

```bash
pnpm -C backend test
pnpm -C frontend test
pnpm -C frontend typecheck
pnpm exec playwright test tests/e2e/chat-customer-read-and-typing.spec.ts
pnpm lint
pnpm build
git diff --check
```

Expected: pass. If Playwright is blocked by local Chatwoot readiness, record
the exact blocker and run backend/frontend unit coverage plus manual runtime
smoke.

- [ ] **Step 7: Runtime manual smoke**

Manual cases:

1. Agent sends a private message; portal user is at bottom; agent sees message
   become read in Chatwoot.
2. Agent sends a private message; portal user is reading old history above
   bottom; agent does not see read until user returns to bottom.
3. Portal opens from offline cache; Chatwoot read state does not change.
4. Simulated stale SSE while backend is reachable eventually refreshes the
   latest active-thread snapshot without duplicate messages.
5. Portal user types in private chat; agent sees customer typing.
6. Agent types in private chat; portal shows the textless animated three-dot
   indicator.
7. Agent stops typing; portal indicator disappears.
8. Group thread: customer-read is skipped; typing is generic and does not claim
   per-user read.

- [ ] **Step 8: Smoke review checkpoint**

Review:

- all previous failed-read-receipt regressions stay impossible:
  - no support-read two checks in portal;
  - no `agent_last_seen_at` inference;
  - no unread/push mutation from read sync;
  - no auto-scroll caused by read/typing;
  - no group read lie.
  - no customer read sync from stale realtime fallback before viewport render.

Commit:

```bash
git add tests docs/product
git commit -m "test: smoke customer read and typing"
```

## Production Rollout Checklist

1. Deploy portal backend/frontend only; do not modify Chatwoot code.
2. Run migrations.
3. Run tenant Chatwoot verify/configure script so
   `chatwoot_portal_inbox_identifier` is stored:

```bash
pnpm -C backend tenant:chatwoot:verify -- --tenant provgroup
pnpm -C backend tenant:chatwoot:webhook:configure -- --tenant provgroup
```

4. Confirm Chatwoot API Channel webhook URL is canonical:

```text
https://lk.provgroup.ru/api/chatwoot/webhooks
```

5. Confirm Chatwoot API Channel webhook secret is stored in tenant runtime.
6. Manual smoke private read and typing before broad testing.

## Plan Self-Review

Spec coverage:

- Realtime health fallback prerequisite is covered by Task 0; F-CHAT-006 is
  closed before Task 4 or Task 6 starts.
- Customer read to agent is covered by Tasks 1-4 and runtime smoke.
- Portal user typing to agent is covered by Task 5.
- Agent typing to portal user is covered by Task 6.
- Runtime and production smoke are covered by Task 7 and the rollout checklist.
- Removal of the risky Chatwoot patch path is covered by Status and Product
  Contract.

Placeholder scan:

- No placeholder markers are present.
- The only future-looking rule is an explicit non-goal: portal user-sent two
  checks remain deferred until Chatwoot exposes a real upstream event.

Type consistency:

- Chatwoot public API uses `inboxIdentifier`, `contactIdentifier`,
  `conversationDisplayId` and `typingStatus` consistently.
- The plan treats existing `chatwootConversationId` values as Chatwoot display
  ids because Chatwoot account API and webhook payloads expose display id as
  `id`.
- Typing realtime events use `type: 'typing'` and `actor: 'agent'`.

Risk review:

- Contact-side `update_last_seen` has no Chatwoot-side throttle, so portal
  adds frontend and backend throttles.
- Customer read sync is private-only to avoid false group read semantics.
- Typing is transient and not persisted as message/read state.
- Missing public API identifiers fail closed and are fixed by tenant
  verify/configure scripts.
- Realtime fallback refresh is data freshness only; it must not mark Chatwoot
  read, mutate support-read state, trigger push or claim messages were viewed
  before viewport confirmation.
- Review finding closure:
  - F-CHAT-006 realtime health snapshot fallback is covered by Task 0.
  - Public API timeout normalization is covered by Task 2.
  - Typing-to-agent fail-closed behavior is covered by Task 5.
  - Chatwoot typing `is_private` parsing is covered by Task 6.
  - Read-sync debounce by latest visible agent-message boundary is covered by
    Task 4.
  - Agent typing thread cleanup is covered by Task 6.
  - Drizzle SQL plus metadata migration workflow is covered by Task 1.
