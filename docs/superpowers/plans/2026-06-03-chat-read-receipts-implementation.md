# Chat Read Receipts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add honest portal chat read receipts without changing Chatwoot core.

**Architecture:** Portal DB stores per-user per-thread read state. Backend moves
read state forward only after a successful latest snapshot for a visible thread,
then includes receipt metadata in snapshots/realtime. Agent-facing visibility is
bridged through a supported Chatwoot surface only after that surface is verified.

**Tech Stack:** Node.js backend, Fastify, Drizzle/Postgres, React 19, Vitest,
Playwright/MCP smoke where browser behavior matters.

---

## File Structure

- Create: `backend/src/modules/chat-read-receipts/repository.ts`
  - DB access for `portal_chat_read_states`.
- Create: `backend/src/modules/chat-read-receipts/service.ts`
  - Read-state rules and forward-only updates.
- Create: `backend/src/modules/chat-read-receipts/repository.test.ts`
  - Repository tests with isolated Postgres test DB.
- Create: `backend/src/modules/chat-read-receipts/service.test.ts`
  - Unit tests for read semantics.
- Modify: `backend/src/db/schema.ts`
  - Add `portalChatReadStates`.
- Create: `backend/drizzle/0007_chat_read_states.sql`
  - Add DB migration.
- Modify: `backend/src/modules/chat-messages/types.ts`
  - Add optional receipt fields to `PortalChatMessage`.
- Modify: `backend/src/modules/chat-messages/service.ts`
  - Record current-user read state on successful latest snapshots.
- Modify: `backend/src/modules/chat-messages/messageMapping.ts`
  - Attach receipt metadata to mapped messages.
- Modify: `backend/src/modules/chat-realtime/hub.ts`
  - Keep existing snapshot fanout; no separate receipt event unless needed.
- Modify: `frontend/src/features/chat/types.ts`
  - Add optional receipt fields to `ChatMessage`.
- Modify: `frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx`
  - Show `Прочитано` only for confirmed read state.
- Modify: `frontend/src/features/chat/components/ChatTranscript.test.tsx`
  - Cover honest sent/read labels.
- Optional after bridge verification: `backend/src/integrations/chatwoot/client.ts`
  - Add conversation custom-attribute update if supported and visible.

## Task 1: Verify Chatwoot Support-Read Source

**Files:**

- Read: `../chatwoot-ce-stable/app/models/message.rb`
- Read: `backend/src/integrations/chatwoot/messagePayload.ts`
- Read: Chatwoot API docs for message status and conversation custom attributes.

- [ ] **Step 1: Verify current parsed message status**

Confirm that `backend/src/integrations/chatwoot/messagePayload.ts` parses
`payload.status` into `ChatwootMessage.status`.

Expected evidence:

```ts
export type ChatwootMessage = {
  status: string
}
```

- [ ] **Step 2: Verify Chatwoot status semantics**

Check Chatwoot CE model:

```rb
enum status: { sent: 0, delivered: 1, read: 2, failed: 3 }
```

Then verify whether API-channel messages created by portal can become `read`
when an agent opens the conversation in Chatwoot.

Expected decision:

- if reliable: allow `readBySupportAt` from Chatwoot status;
- if not reliable: keep portal outgoing UI at `Отправлено` and do not show
  `Прочитано` for support read until a reliable source exists.

- [ ] **Step 3: Verify agent-facing bridge**

Confirm whether conversation custom attributes are visible enough to agents in
our Chatwoot UI without core changes.

Expected decision:

- if visible enough: implement custom-attribute bridge in a later task;
- if not visible enough: stop before agent-facing bridge and ask owner to choose
  between future Chatwoot core UI work and throttled private notes.

## Task 2: Add Portal Read-State Persistence

**Files:**

- Modify: `backend/src/db/schema.ts`
- Create: `backend/drizzle/0007_chat_read_states.sql`
- Create: `backend/src/modules/chat-read-receipts/repository.ts`
- Create: `backend/src/modules/chat-read-receipts/repository.test.ts`

- [ ] **Step 1: Write repository tests**

Add tests for:

- insert/upsert creates a read state;
- older `last_read_chatwoot_message_id` does not regress state;
- newer message id moves state forward;
- tenant/user/thread scope is isolated.

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-read-receipts/repository.test.ts
```

Expected: FAIL until repository/schema exist.

- [ ] **Step 2: Add schema and migration**

Add table `portal_chat_read_states` with:

```sql
tenant_id integer not null references portal_tenants(id) on delete restrict,
portal_user_id integer not null references portal_users(id) on delete cascade,
portal_chat_thread_id integer references portal_chat_threads(id) on delete set null,
thread_id text not null,
last_read_chatwoot_message_id integer not null,
last_read_at timestamptz not null,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
unique (tenant_id, portal_user_id, thread_id)
```

Also add indexes for tenant/user/thread and tenant/thread/message lookups.

- [ ] **Step 3: Implement repository**

Implement `upsertReadStateForwardOnly(input)` and `getReadStatesForThread(input)`.

Forward-only rule:

```ts
where excluded.last_read_chatwoot_message_id >
  portal_chat_read_states.last_read_chatwoot_message_id
```

- [ ] **Step 4: Run repository tests**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-read-receipts/repository.test.ts
```

Expected: PASS.

## Task 3: Record Read State On Latest Snapshot

**Files:**

- Create: `backend/src/modules/chat-read-receipts/service.ts`
- Create: `backend/src/modules/chat-read-receipts/service.test.ts`
- Modify: `backend/src/modules/chat-messages/service.ts`
- Modify: `backend/src/modules/chat-messages/service.test.ts`

- [ ] **Step 1: Write service tests**

Cover:

- ready latest snapshot with messages records max visible Chatwoot message id;
- `beforeMessageId` older-page request does not record read;
- `not_ready` and `unavailable` do not record read;
- denied thread does not record read;
- group chat records read for only the current portal user.

- [ ] **Step 2: Implement read receipt service**

Implement `recordOpenedLatestSnapshotRead` with inputs:

```ts
{
  portalUserId: number
  portalChatThreadId: number | null
  threadId: string
  messages: PortalChatMessage[]
}
```

Use only client-visible messages with positive numeric `id`.

- [ ] **Step 3: Wire into message snapshot path**

In `backend/src/modules/chat-messages/service.ts`, call the service only after
a successful latest snapshot for the requested thread. Do not call it for older
history pagination.

- [ ] **Step 4: Run backend tests**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-read-receipts/service.test.ts src/modules/chat-messages/service.test.ts
```

Expected: PASS.

## Task 4: Expose Receipt Metadata In Snapshots

**Files:**

- Modify: `backend/src/modules/chat-messages/types.ts`
- Modify: `backend/src/modules/chat-messages/messageMapping.ts`
- Modify: `backend/src/modules/chat-messages/messageMapping.test.ts`
- Modify: `frontend/src/features/chat/types.ts`

- [ ] **Step 1: Add type fields**

Add optional fields:

```ts
readByCurrentUserAt?: string | null
readBySupportAt?: string | null
```

- [ ] **Step 2: Add mapping tests**

Test that incoming messages at or below current user's read state get
`readByCurrentUserAt`, and outgoing current-user messages get
`readBySupportAt` only when a support-read source is present.

- [ ] **Step 3: Implement mapping**

Pass read-state context into `mapPortalMessage` without changing message
visibility rules.

- [ ] **Step 4: Run mapping/type tests**

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-messages/messageMapping.test.ts
pnpm --dir frontend run typecheck
```

Expected: PASS.

## Task 5: Frontend Receipt UI

**Files:**

- Modify: `frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx`
- Modify: `frontend/src/features/chat/components/ChatTranscript.test.tsx`

- [ ] **Step 1: Write UI tests**

Cover:

- outgoing sent message without `readBySupportAt` exposes `Отправлено`;
- outgoing message with `readBySupportAt` exposes `Прочитано`;
- queued/sending/failed labels remain unchanged.

- [ ] **Step 2: Implement UI**

Keep one-check `Отправлено` for sent messages. Add a distinct read indicator
only when `message.readBySupportAt` is present.

- [ ] **Step 3: Run frontend tests**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/chat/components/ChatTranscript.test.tsx
```

Expected: PASS.

## Task 6: Agent-Facing Bridge

**Files:**

- Modify only after Task 1 confirms the bridge:
  - `backend/src/integrations/chatwoot/client.ts`
  - `backend/src/modules/chat-read-receipts/service.ts`
  - related tests

- [ ] **Step 1: Implement only the chosen bridge**

If conversation custom attributes are chosen, update only when read state moves
forward and use fields:

```json
{
  "portal_last_read_thread_id": "group:154",
  "portal_last_read_message_id": 9001,
  "portal_last_read_at": "2026-06-03T10:00:00.000Z",
  "portal_last_read_by": "Ivan Petrov"
}
```

- [ ] **Step 2: Add throttling/debounce**

Avoid writing to Chatwoot on every repeated snapshot. One update per forward
movement is enough.

- [ ] **Step 3: Test bridge failure handling**

Bridge failure must not roll back local read state and must not break snapshot
response.

## Task 7: Closure

**Files:**

- All files modified in Tasks 1-6.

- [ ] **Step 1: Run targeted backend tests**

```bash
pnpm --dir backend exec vitest run src/modules/chat-read-receipts src/modules/chat-messages src/modules/chat-realtime
```

- [ ] **Step 2: Run targeted frontend tests**

```bash
pnpm --dir frontend exec vitest run src/features/chat/components/ChatTranscript.test.tsx src/features/chat/pages/ChatPage.runtime.test.tsx
```

- [ ] **Step 3: Run typecheck and diff check**

```bash
pnpm --dir backend run typecheck
pnpm --dir frontend run typecheck
git diff --check
```

- [ ] **Step 4: Review before merge**

Verify:

- no read state is recorded from offline cache;
- no read state is recorded from denied/unavailable/older-page responses;
- no UI text says `Прочитано` without backend proof;
- Chatwoot core is untouched.

## Self-Review

- Spec coverage: persistence, snapshot recording, frontend UI, no-core Chatwoot
  constraint, group/private scope and reliability rules are covered.
- Placeholder scan: no task depends on an undefined future file without naming
  the file and decision point.
- Type consistency: receipt fields are consistently named
  `readByCurrentUserAt` and `readBySupportAt`.
