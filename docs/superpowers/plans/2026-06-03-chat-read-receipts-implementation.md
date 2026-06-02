# Chat Read Receipts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add honest portal chat read receipts without changing Chatwoot core:
portal users see `Прочитано поддержкой` only when Chatwoot support last-seen
actually covers their message, and Chatwoot can receive customer read updates
when the portal user opens a fresh thread snapshot.

**Architecture:** Keep message send state and read receipt state separate.
Portal DB stores one forward-only read row per tenant/user/thread. Backend moves
portal read state only after a successful fresh latest snapshot for a visible
thread, optionally syncs Chatwoot contact `update_last_seen`, and exposes
receipt metadata through snapshots plus a dedicated receipt refresh endpoint.
Browser never calls Chatwoot directly.

**Tech Stack:** Node.js backend, Fastify, Drizzle/Postgres, React 19, Vitest,
Playwright/MCP smoke where browser behavior matters.

---

## Source Spec

This plan implements:

```text
docs/superpowers/specs/2026-06-02-chat-read-receipts-design.md
```

Related reliability context:

```text
docs/superpowers/specs/2026-06-02-chat-message-reliability-design.md
docs/superpowers/plans/2026-06-02-chat-message-reliability.md
docs/product/chat-message-send-ui-scenarios.md
```

Do not merge this plan with reliability work. Reliability owns send/outbox
truth. This slice owns receipt truth.

## Review Baseline

Verified against current `main` on 2026-06-03:

- `MessageBubble` now labels confirmed successful outgoing messages
  `Отправлено`, not `Доставлено`.
- `PortalChatMessage` and frontend `ChatMessage` still expose one `status`
  field.
- `normalizePortalMessageStatus` still forces current portal user's Chatwoot
  messages to `sent`.
- `ChatwootMessage.status` is parsed.
- `ChatwootMessageClient.listConversationMessages` currently discards response
  meta, including `agent_last_seen_at` and `assignee_last_seen_at`.
- `GET /api/chat/messages` clears unread only after a successful latest
  selected-thread snapshot.
- `portal_chat_threads.chatwoot_conversation_id` stores the public/display
  conversation id returned as `id` by Chatwoot account conversation JSON.
- `findConversationMessageById(conversationId, messageId)` already verifies a
  message inside the current Chatwoot conversation and can be reused by receipt
  refresh.
- Webhooks currently support `message_created` and `message_updated` only;
  `message_updated` does not create unread.
- Open reliability findings remain:
  - `docs/findings/F-CHAT-005-frontend-attachment-validation.md`;
  - `docs/findings/F-CHAT-006-realtime-health-snapshot-fallback.md`.

Verified against Chatwoot docs and local `../chatwoot-ce-stable`:

- Chatwoot statuses are `sent`, `delivered`, `read`, `failed`.
- API Channel supports sent/delivered/read/failed statuses.
- Public `update_last_seen` endpoint requires API inbox identifier, contact
  source id and conversation path id.
- Chatwoot docs name that path parameter `conversation_id`, but local CE
  controllers resolve it by `display_id`; current portal conversation `id`
  matches this display id.
- Chatwoot account messages index returns `meta.agent_last_seen_at` and
  `meta.assignee_last_seen_at`.
- Chatwoot dashboard `update_last_seen` updates `agent_last_seen_at` via
  `update_columns`, so portal cannot rely on webhook events for support-read
  changes.
- Public `update_last_seen` updates `contact_last_seen_at` and schedules
  `Conversations::UpdateMessageStatusJob`.

## Non-Goals

- Do not add a user-facing `Доставлено` state.
- Do not change Chatwoot Rails/core code.
- Do not expose Chatwoot ids, tokens or public API authority to the browser.
- Do not add per-message portal DB receipt rows.
- Do not promise per-user group read state inside the standard Chatwoot
  dashboard.
- Do not make push/app badge/unread counters a receipt source.
- Do not mark cached offline snapshots as read.

## Chosen Public Model

Replace browser-facing message status with separate fields:

```ts
export type PortalMessageSendState = 'queued' | 'sending' | 'failed' | 'sent'

export type PortalMessageReceipt =
  | { kind: 'none' }
  | { kind: 'support_unread' }
  | { kind: 'support_read'; readAt: string }
  | {
      kind: 'group_read_summary'
      readByCount: number
      readByCurrentUser: boolean
      totalParticipantCount: number
    }

export type PortalChatMessage = {
  // existing content, attachment, author, reply and identity fields
  receipt: PortalMessageReceipt
  sendState: PortalMessageSendState
}
```

Rules:

- Local optimistic records use `sendState = queued | sending | failed` and
  `receipt = { kind: 'none' }`.
- Backend-accepted Chatwoot messages use `sendState = 'sent'`.
- Current user's sent messages use `receipt.kind = 'support_unread'` until
  support last-seen covers the message.
- Current user's sent messages use `receipt.kind = 'support_read'` only when
  `message.createdAt <= supportLastSeenAt`.
- Incoming agent messages do not show noisy `Прочитано вами` in portal UI.
- Group participant read summary is stored for future use, but MVP transcript
  can keep it hidden.

## File Structure

Backend create:

- `backend/src/modules/chat-read-receipts/types.ts`
  - Receipt types, DB input types and timestamp helpers.
- `backend/src/modules/chat-read-receipts/repository.ts`
  - DB access for `portal_chat_thread_reads`.
- `backend/src/modules/chat-read-receipts/repository.test.ts`
  - Tenant/user/thread isolation and forward-only upsert tests.
- `backend/src/modules/chat-read-receipts/service.ts`
  - Read marker, Chatwoot sync and receipt computation rules.
- `backend/src/modules/chat-read-receipts/service.test.ts`
  - Unit tests for read semantics and failure policy.
- `backend/src/modules/chat-threads/contactInboxSource.ts`
  - Shared helper to resolve/create API-channel contact inbox `source_id`.
- `backend/src/modules/chat-threads/contactInboxSource.test.ts`
  - Reuse existing source id and create-missing fallback tests.

Backend modify:

- `backend/src/db/schema.ts`
  - Add `portalChatThreadReads`.
- `backend/drizzle/<next>_chat_thread_reads.sql`
  - Add `portal_chat_thread_reads`.
  - Current `main` latest migration is `0006_remove_push_enabled_notification_preferences.sql`,
    so the expected next migration at review time is `0007_chat_thread_reads.sql`.
    Re-check latest migration before implementation.
- `backend/drizzle/meta/_journal.json`
  - Add the new migration entry if Drizzle generation does not do it.
- `backend/src/integrations/chatwoot/client.ts`
  - Parse `inbox_identifier` in portal inbox routing/details.
  - Add public `markPublicConversationLastSeen`.
- `backend/src/integrations/chatwoot/client.test.ts`
  - Cover inbox identifier parsing and public last-seen URL.
- `backend/src/integrations/chatwoot/messagePayload.ts`
  - Add messages response meta parsing for support last-seen fields.
- `backend/src/integrations/chatwoot/messageClient.ts`
  - Return messages plus meta from `listConversationMessages`.
- `backend/src/integrations/chatwoot/messageClient.test.ts`
  - Cover numeric, ISO string and null last-seen values.
- `backend/src/modules/chat-threads/runtime.ts`
  - Reuse `ensurePortalContactInboxSourceId` from the shared helper.
- `backend/src/modules/chat-messages/types.ts`
  - Replace public message `status` with `sendState + receipt`.
  - Add `ChatReceiptStateResponse`.
- `backend/src/modules/chat-messages/messageMapping.ts`
  - Map send state and receipts.
- `backend/src/modules/chat-messages/messageMapping.test.ts`
  - Cover status separation and support-read computation.
- `backend/src/modules/chat-messages/service.ts`
  - Record read state after successful latest snapshot.
  - Sync Chatwoot public last-seen after marker update.
  - Add `getCurrentUserChatReceiptState`.
- `backend/src/modules/chat-messages/service.test.ts`
  - Cover snapshot read marker and receipt refresh.
- `backend/src/modules/chat-messages/routes.ts`
  - Add `POST /api/chat/threads/:threadId/receipt-state`.
- `backend/src/modules/chat-messages/routes.test.ts`
  - Cover receipt-state request validation and auth.
- `backend/src/modules/chatwoot-webhooks/service.test.ts`
  - Keep coverage that `message_updated` does not create unread.
- `backend/src/app.ts`
  - Wire read receipt repository/service into chat messages service.

Frontend create:

- `frontend/src/features/chat/api/chatReceipts.ts` or extend
  `frontend/src/features/chat/api/chatClient.ts`
  - Client call for receipt-state endpoint.
- `frontend/src/features/chat/pages/useChatReceiptRefresh.ts`
  - Bounded selected-thread receipt refresh.
- `frontend/src/features/chat/pages/useChatReceiptRefresh.test.tsx`
  - Hidden/offline/useful-message refresh tests.
- `frontend/src/features/chat/lib/chatReceipts.ts`
  - Pure helpers for receipt labels and merge.
- `frontend/src/features/chat/lib/chatReceipts.test.ts`
  - Receipt merge and label tests.

Frontend modify:

- `frontend/src/features/chat/types.ts`
  - Replace `status` with `sendState + receipt` on `ChatMessage`.
- `frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx`
  - Show `Отправлено` vs `Прочитано поддержкой`.
- `frontend/src/features/chat/components/ChatTranscript.test.tsx`
  - Cover message labels.
- `frontend/src/features/chat/pages/useOptimisticTextSend.ts`
  - Create optimistic messages with `sendState` and `receipt`.
- `frontend/src/features/chat/pages/useChatOutboxDrainIntegration.ts`
  - Reconcile sent records with `sendState`.
- `frontend/src/features/chat/pages/ChatPage.tsx`
  - Wire receipt refresh.
- Existing chat page tests and fixtures that construct messages.

Docs modify:

- `docs/product/chat-message-send-ui-scenarios.md`
  - Move planned read receipt scenarios into current behavior once implemented.
- Delete or update any temporary finding if a related finding is fully closed.

## Task 0: Re-Verify Chatwoot Sources Before Coding

**Files:**

- Read: `../chatwoot-ce-stable/app/models/message.rb`
- Read:
  `../chatwoot-ce-stable/app/controllers/public/api/v1/inboxes/conversations_controller.rb`
- Read:
  `../chatwoot-ce-stable/app/controllers/api/v1/accounts/conversations_controller.rb`
- Read:
  `../chatwoot-ce-stable/app/views/api/v1/accounts/conversations/messages/index.json.jbuilder`
- Read:
  `../chatwoot-ce-stable/app/views/api/v1/models/_inbox.json.jbuilder`
- Read: official Chatwoot docs:
  - `https://developers.chatwoot.com/self-hosted/message-statuses`
  - `https://developers.chatwoot.com/api-reference/conversations-api/update-last-seen`
  - `https://developers.chatwoot.com/api-reference/conversations/conversation-details`

- [ ] **Step 1: Confirm message statuses**

Expected evidence:

```ruby
enum status: { sent: 0, delivered: 1, read: 2, failed: 3 }
```

- [ ] **Step 2: Confirm contact last-seen endpoint**

Expected evidence:

```text
POST /public/api/v1/inboxes/:inbox_identifier/contacts/:source_id/conversations/:display_id/update_last_seen
```

Local Chatwoot CE uses `display_id` even if public docs call the path value
`conversation_id`.

- [ ] **Step 3: Confirm support last-seen source**

Expected evidence:

```ruby
json.agent_last_seen_at @conversation.agent_last_seen_at
json.assignee_last_seen_at @conversation.assignee_last_seen_at
```

- [ ] **Step 4: Confirm webhook limitation**

Expected evidence:

```ruby
@conversation.update_columns(updates)
```

Decision:

- selected-thread receipt refresh is required;
- do not rely only on `message_updated` webhook.

## Task 1: Split Public Message Send State From Receipt

**Files:**

- Modify: `backend/src/modules/chat-messages/types.ts`
- Modify: `backend/src/modules/chat-messages/messageMapping.ts`
- Modify: `backend/src/modules/chat-messages/messageMapping.test.ts`
- Modify: `frontend/src/features/chat/types.ts`
- Modify existing frontend test fixtures that use `status`.

- [ ] **Step 1: Add backend public types**

Add:

```ts
export type PortalMessageSendState = 'queued' | 'sending' | 'failed' | 'sent'

export type PortalMessageReceipt =
  | { kind: 'none' }
  | { kind: 'support_unread' }
  | { kind: 'support_read'; readAt: string }
  | {
      kind: 'group_read_summary'
      readByCount: number
      readByCurrentUser: boolean
      totalParticipantCount: number
    }
```

Then replace `PortalChatMessage.status` with:

```ts
receipt: PortalMessageReceipt
sendState: PortalMessageSendState
```

- [ ] **Step 2: Write mapping tests first**

Cover:

- current portal user's canonical Chatwoot message maps to
  `sendState: 'sent'`;
- current portal user's message without support read maps to
  `receipt: { kind: 'support_unread' }`;
- agent/group messages map to `receipt: { kind: 'none' }` in MVP;
- local queued/sending/failed states are not produced by backend mapper.

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-messages/messageMapping.test.ts
```

Expected: FAIL until implementation changes.

- [ ] **Step 3: Implement mapper separation**

Replace `normalizePortalMessageStatus` with a send-state resolver:

```ts
function resolvePortalMessageSendState(
  message: ChatwootMessage,
  presentation: Pick<ReturnType<typeof mapMessagePresentation>, 'direction'>,
): PortalMessageSendState {
  if (
    presentation.direction === 'outgoing' &&
    isPortalSendSourceId(message.sourceId)
  ) {
    return 'sent'
  }

  return 'sent'
}
```

Use receipt context later in Task 5. For Task 1 default all mapped receipts to
`{ kind: 'none' }` except current user's sent messages, which can be
`support_unread`.

- [ ] **Step 4: Update frontend type**

Replace `ChatMessage.status` with:

```ts
receipt: ChatMessageReceipt
sendState: ChatMessageSendState
```

Keep `errorCode` for local failed text sends.

- [ ] **Step 5: Update fixtures only enough for compile**

Convert test fixtures from:

```ts
status: 'sent'
```

to:

```ts
receipt: { kind: 'none' },
sendState: 'sent'
```

- [ ] **Step 6: Run targeted checks**

```bash
pnpm --dir backend exec vitest run src/modules/chat-messages/messageMapping.test.ts
pnpm --dir frontend run typecheck
```

Expected: PASS.

Checkpoint commit:

```bash
git add backend/src/modules/chat-messages frontend/src/features/chat
git commit -m "feat: split chat send state from receipts"
```

## Task 2: Add Portal Read-State Persistence

**Files:**

- Create: `backend/src/modules/chat-read-receipts/types.ts`
- Create: `backend/src/modules/chat-read-receipts/repository.ts`
- Create: `backend/src/modules/chat-read-receipts/repository.test.ts`
- Modify: `backend/src/db/schema.ts`
- Create: `backend/drizzle/<next>_chat_thread_reads.sql`

- [ ] **Step 1: Write repository tests first**

Cover:

- insert creates one row for tenant/user/thread;
- newer message id moves state forward;
- older message id does not regress state;
- same message id updates `last_opened_at` but not read boundary;
- tenant isolation;
- user isolation;
- thread isolation.

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-read-receipts/repository.test.ts
```

Expected: FAIL until schema/repository exist.

- [ ] **Step 2: Add schema**

Add `portalChatThreadReads` for table `portal_chat_thread_reads`:

```ts
export const portalChatThreadReads = pgTable(
  'portal_chat_thread_reads',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => portalTenants.id, {
        onDelete: 'restrict',
      }),
    portalUserId: integer('portal_user_id')
      .notNull()
      .references(() => portalUsers.id, { onDelete: 'cascade' }),
    portalChatThreadId: integer('portal_chat_thread_id')
      .notNull()
      .references(() => portalChatThreads.id, { onDelete: 'cascade' }),
    threadId: text('thread_id').notNull(),
    chatwootConversationId: integer('chatwoot_conversation_id').notNull(),
    lastReadChatwootMessageId: integer(
      'last_read_chatwoot_message_id',
    ).notNull(),
    lastReadMessageCreatedAt: timestamp(
      'last_read_message_created_at',
      timestampWithTimezone,
    ).notNull(),
    lastOpenedAt: timestamp('last_opened_at', timestampWithTimezone).notNull(),
    chatwootContactLastSeenSyncedAt: timestamp(
      'chatwoot_contact_last_seen_synced_at',
      timestampWithTimezone,
    ),
    chatwootContactLastSeenSyncStatus: text(
      'chatwoot_contact_last_seen_sync_status',
    )
      .notNull()
      .default('not_required'),
    chatwootContactLastSeenSyncError: text(
      'chatwoot_contact_last_seen_sync_error',
    ),
    createdAt: timestamp('created_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', timestampWithTimezone)
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('portal_chat_thread_reads_tenant_user_thread_unique').on(
      table.tenantId,
      table.portalUserId,
      table.portalChatThreadId,
    ),
    index('portal_chat_thread_reads_tenant_thread_idx').on(
      table.tenantId,
      table.portalChatThreadId,
    ),
    index('portal_chat_thread_reads_tenant_user_thread_id_idx').on(
      table.tenantId,
      table.portalUserId,
      table.threadId,
    ),
    check(
      'portal_chat_thread_reads_sync_status_check',
      sql`${table.chatwootContactLastSeenSyncStatus} in ('not_required', 'pending', 'synced', 'failed')`,
    ),
  ],
)
```

- [ ] **Step 3: Add migration**

Use the next migration number. At review time it is expected to be:

```text
backend/drizzle/0007_chat_thread_reads.sql
```

SQL must match schema names and constraints. Do not use
`portal_chat_read_states`.

- [ ] **Step 4: Implement repository**

Required methods:

```ts
upsertReadStateForwardOnly(input): Promise<PortalChatThreadReadRow>
getReadStateForUserThread(input): Promise<PortalChatThreadReadRow | null>
listReadStatesForThread(input): Promise<PortalChatThreadReadRow[]>
markChatwootLastSeenSyncStatus(input): Promise<void>
```

Forward-only rule:

```sql
last_read_chatwoot_message_id =
  greatest(portal_chat_thread_reads.last_read_chatwoot_message_id, excluded.last_read_chatwoot_message_id)
```

If using `onConflictDoUpdate`, add a `where` clause for boundary fields when
the new message id is greater; still update `last_opened_at` and `updated_at`
on duplicate opens.

- [ ] **Step 5: Run repository tests**

```bash
pnpm --dir backend exec vitest run src/modules/chat-read-receipts/repository.test.ts
```

Expected: PASS.

Checkpoint commit:

```bash
git add backend/src/db/schema.ts backend/drizzle backend/src/modules/chat-read-receipts
git commit -m "feat: add chat read state persistence"
```

## Task 3: Share Contact Inbox Source Resolution

**Files:**

- Create: `backend/src/modules/chat-threads/contactInboxSource.ts`
- Create: `backend/src/modules/chat-threads/contactInboxSource.test.ts`
- Modify: `backend/src/modules/chat-threads/runtime.ts`

- [ ] **Step 1: Extract helper**

Move the current nested `ensurePortalContactInboxSourceId` behavior from
`chat-threads/runtime.ts` into:

```ts
export async function ensurePortalContactInboxSourceId({
  chatwootClient,
  contactId,
  createSourceId = () => `portal-contact:${randomUUID()}`,
}: {
  chatwootClient: Pick<
    ChatwootClient,
    'createContactInbox' | 'findContactPortalInboxSourceId'
  >
  contactId: number
  createSourceId?: () => string
})
```

Behavior:

- return existing source id when found;
- create contact inbox when missing;
- if creation races/fails with Chatwoot request error, retry lookup once;
- rethrow non-Chatwoot errors.

- [ ] **Step 2: Test helper**

Cover existing source, create missing, race/fallback and hard failure.

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-threads/contactInboxSource.test.ts
```

Expected: PASS.

- [ ] **Step 3: Replace runtime nested helper**

Use the shared helper in `chat-threads/runtime.ts`; behavior must not change.

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-threads src/modules/chat-messages/service.thread-runtime.test.ts
```

Expected: PASS.

Checkpoint commit:

```bash
git add backend/src/modules/chat-threads
git commit -m "refactor: share chat contact inbox source resolution"
```

## Task 4: Add Chatwoot Last-Seen Inputs

**Files:**

- Modify: `backend/src/integrations/chatwoot/client.ts`
- Modify: `backend/src/integrations/chatwoot/client.test.ts`
- Modify: `backend/src/integrations/chatwoot/messagePayload.ts`
- Modify: `backend/src/integrations/chatwoot/messageClient.ts`
- Modify: `backend/src/integrations/chatwoot/messageClient.test.ts`

- [ ] **Step 1: Parse inbox identifier**

Extend `ChatwootPortalInboxRouting`:

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

Map from Chatwoot `inbox_identifier`.

- [ ] **Step 2: Add public last-seen client method**

Add:

```ts
markPublicConversationLastSeen({
  conversationId,
  inboxIdentifier,
  sourceId,
}: {
  conversationId: number
  inboxIdentifier: string
  sourceId: string
}): Promise<void>
```

Call:

```text
POST /public/api/v1/inboxes/{inboxIdentifier}/contacts/{sourceId}/conversations/{conversationId}/update_last_seen
```

Validate that `conversationId` is positive, `inboxIdentifier` and `sourceId`
are non-empty. Return controlled `ChatwootClientRequestError` on 401/404/non-ok.

- [ ] **Step 3: Parse messages meta**

Add:

```ts
export type ChatwootMessagesMeta = {
  agentLastSeenAt: Date | null
  assigneeLastSeenAt: Date | null
}
```

Parsing rules:

- accept `null`/missing as `null`;
- accept Unix seconds as `new Date(seconds * 1000)`;
- accept ISO/date strings if Chatwoot returns them;
- reject invalid object shape only when payload itself is malformed.

Change `ChatwootMessagesPage`:

```ts
export type ChatwootMessagesPage = {
  hasMoreOlder: boolean
  messages: ChatwootMessage[]
  meta: ChatwootMessagesMeta
  nextOlderCursor: number | null
}
```

Also add meta to `ChatwootMessagesAfterPage` if the shared parser makes it
natural; otherwise keep after-page unchanged if unused by receipts.

- [ ] **Step 4: Preserve existing list behavior**

`listConversationMessages` still returns sorted messages and cursors. Existing
call sites must be updated to read `page.messages`.

- [ ] **Step 5: Tests**

Run:

```bash
pnpm --dir backend exec vitest run src/integrations/chatwoot/client.test.ts src/integrations/chatwoot/messageClient.test.ts
pnpm --dir backend run typecheck
```

Expected: PASS.

Checkpoint commit:

```bash
git add backend/src/integrations/chatwoot
git commit -m "feat: expose chatwoot read receipt inputs"
```

## Task 5: Record Read State On Successful Latest Snapshot

**Files:**

- Create: `backend/src/modules/chat-read-receipts/service.ts`
- Create: `backend/src/modules/chat-read-receipts/service.test.ts`
- Modify: `backend/src/modules/chat-messages/service.ts`
- Modify: `backend/src/modules/chat-messages/service.test.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Write service tests first**

Cover:

- latest ready snapshot with visible messages writes max visible message id;
- empty latest snapshot updates `last_opened_at` but does not create a boundary
  row without a message;
- older history page with `beforeMessageId` does not write;
- `not_ready` and `unavailable` do not write;
- removed/denied group thread does not write;
- private and group writes are scoped to current portal user;
- write happens before Chatwoot public last-seen sync result is considered.

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-read-receipts/service.test.ts
```

Expected: FAIL until service exists.

- [ ] **Step 2: Implement read marker service**

Add:

```ts
recordOpenedLatestSnapshotRead({
  chatwootConversationId,
  messages,
  portalChatThreadId,
  portalUserId,
  threadId,
}): Promise<PortalChatThreadReadRow | null>
```

Use only visible messages with positive numeric Chatwoot ids. Boundary is the
newest visible message by `(createdAt, id)`, not wall-clock now.

- [ ] **Step 3: Wire into latest snapshot path**

In `getCurrentUserChatMessages`:

- fetch Chatwoot page;
- map visible messages;
- build snapshot;
- if `beforeMessageId === null`, `snapshot.result === 'ready'`,
  `context.portalChatThreadId !== null`, call read receipt service;
- then keep current unread clear behavior unchanged.

Do not write read marker for:

- cached frontend snapshots;
- context/search/media endpoints;
- older history pagination;
- receipt-state endpoint.

- [ ] **Step 4: Run tests**

```bash
pnpm --dir backend exec vitest run src/modules/chat-read-receipts/service.test.ts src/modules/chat-messages/service.test.ts
```

Expected: PASS.

Checkpoint commit:

```bash
git add backend/src/modules/chat-read-receipts backend/src/modules/chat-messages backend/src/app.ts
git commit -m "feat: record chat read state on fresh snapshots"
```

## Task 6: Sync Customer Read To Chatwoot

**Files:**

- Modify: `backend/src/modules/chat-read-receipts/service.ts`
- Modify: `backend/src/modules/chat-read-receipts/service.test.ts`
- Modify: `backend/src/modules/chat-messages/service.ts`
- Modify: `backend/src/modules/chat-messages/service.test.ts`

- [ ] **Step 1: Add sync tests**

Cover:

- private chat resolves person contact source id and calls public last-seen;
- group chat resolves group contact source id and calls public last-seen;
- missing inbox identifier records `failed` or `pending` and snapshot still
  returns;
- Chatwoot sync request failure records `failed` and snapshot still returns;
- repeated snapshot retries failed/pending sync;
- sync is skipped for older page, unavailable snapshot and denied thread.

- [ ] **Step 2: Implement sync**

After portal read marker write succeeds:

1. Get portal inbox routing/details and require `inboxIdentifier`.
2. Resolve or create API channel source id for `context.targetChatwootContactId`
   using shared `ensurePortalContactInboxSourceId`.
3. Call `markPublicConversationLastSeen`.
4. Mark read row `synced` with timestamp on success.
5. Mark read row `failed` with bounded error text on failure.

Failure must not change the snapshot response status.

- [ ] **Step 3: Keep group wording honest**

For group chats, this sync means the Chatwoot group contact read marker moved.
It does not mean every portal participant read the messages.

- [ ] **Step 4: Run tests**

```bash
pnpm --dir backend exec vitest run src/modules/chat-read-receipts/service.test.ts src/modules/chat-messages/service.test.ts
```

Expected: PASS.

Checkpoint commit:

```bash
git add backend/src/modules/chat-read-receipts backend/src/modules/chat-messages
git commit -m "feat: sync portal chat reads to chatwoot"
```

## Task 7: Compute Receipts In Snapshots

**Files:**

- Modify: `backend/src/modules/chat-read-receipts/service.ts`
- Modify: `backend/src/modules/chat-read-receipts/service.test.ts`
- Modify: `backend/src/modules/chat-messages/messageMapping.ts`
- Modify: `backend/src/modules/chat-messages/messageMapping.test.ts`
- Modify: `backend/src/modules/chat-messages/service.ts`

- [ ] **Step 1: Add receipt context**

Add mapper context:

```ts
receiptContext?: {
  supportLastSeenAt: Date | null
}
```

- [ ] **Step 2: Compute support receipt**

For current user's backend-confirmed messages:

```text
if supportLastSeenAt is null -> support_unread
if message.createdAt < supportLastSeenAt -> support_read
if message.createdAt == supportLastSeenAt -> support_read only when conservative id ordering proves safe, otherwise support_unread
```

MVP conservative rule: if precision is ambiguous, prefer `support_unread`.

- [ ] **Step 3: Add snapshot-level receipt state**

Extend `ChatMessagesSnapshot`:

```ts
receiptState?: {
  chatwootContactLastSeenSyncStatus:
    | 'failed'
    | 'not_required'
    | 'pending'
    | 'synced'
  lastReadMessageId: number | null
  supportLastSeenAt: string | null
}
```

- [ ] **Step 4: Tests**

Cover:

- current user's message before support last-seen returns `support_read`;
- current user's message after support last-seen returns `support_unread`;
- local failed/queued/sending messages cannot return support read;
- incoming agent messages keep `none`;
- snapshot includes receipt state diagnostics.

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-read-receipts/service.test.ts src/modules/chat-messages/messageMapping.test.ts src/modules/chat-messages/service.test.ts
```

Expected: PASS.

Checkpoint commit:

```bash
git add backend/src/modules/chat-read-receipts backend/src/modules/chat-messages
git commit -m "feat: include chat receipt metadata in snapshots"
```

## Task 8: Add Receipt-State Endpoint

**Files:**

- Modify: `backend/src/modules/chat-messages/types.ts`
- Modify: `backend/src/modules/chat-messages/service.ts`
- Modify: `backend/src/modules/chat-messages/service.test.ts`
- Modify: `backend/src/modules/chat-messages/routes.ts`
- Modify: `backend/src/modules/chat-messages/routes.test.ts`

- [ ] **Step 1: Add response type**

```ts
export type ChatReceiptStateResponse = {
  messageReceipts: Array<{
    messageId: number
    receipt: PortalMessageReceipt
  }>
  reason: ChatThreadRuntimeReason
  result: 'not_ready' | 'ready' | 'unavailable'
  supportLastSeenAt: string | null
  threadId: string
}
```

- [ ] **Step 2: Add route**

Add:

```text
POST /api/chat/threads/:threadId/receipt-state
```

Body schema:

```ts
z.object({
  messageIds: z.array(z.number().int().positive()).max(50),
}).strict()
```

Empty `messageIds` returns ready response with empty `messageReceipts` when the
thread itself is ready.

- [ ] **Step 3: Implement service method**

Add:

```ts
getCurrentUserChatReceiptState({
  messageIds,
  threadId,
  userId,
}): Promise<ChatReceiptStateResponse>
```

Rules:

- resolve current user thread context first;
- if thread is not ready, return controlled `not_ready`/`unavailable`;
- for each id, use `findConversationMessageById(context.chatwootConversation.id, id)`;
- ignore ids that do not exist, are private, not client-visible, not current
  user's outgoing messages, or do not belong to current thread;
- do not clear unread;
- do not move portal read marker;
- do not call Chatwoot public `update_last_seen`;
- return only receipt metadata.

- [ ] **Step 4: Tests**

Cover:

- route validates body and auth;
- ready thread returns support receipts for requested ids;
- unknown ids are ignored;
- denied group returns `not_ready`;
- endpoint does not call unread clear;
- endpoint does not call read marker write;
- endpoint does not call Chatwoot public last-seen sync.

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-messages/routes.test.ts src/modules/chat-messages/service.test.ts
```

Expected: PASS.

Checkpoint commit:

```bash
git add backend/src/modules/chat-messages
git commit -m "feat: add chat receipt state endpoint"
```

## Task 9: Update Frontend Message UI

**Files:**

- Modify: `frontend/src/features/chat/types.ts`
- Modify: `frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx`
- Modify: `frontend/src/features/chat/components/ChatTranscript.test.tsx`
- Modify: `frontend/src/features/chat/pages/useOptimisticTextSend.ts`
- Modify: `frontend/src/features/chat/pages/useChatOutboxDrainIntegration.ts`
- Modify affected chat page tests and fixtures.

- [ ] **Step 1: Update local optimistic messages**

Optimistic queued message:

```ts
{
  receipt: { kind: 'none' },
  sendState: isBrowserOnline ? 'sending' : 'queued',
}
```

Failed message:

```ts
{
  errorCode,
  receipt: { kind: 'none' },
  sendState: 'failed',
}
```

- [ ] **Step 2: Update status icon component**

Use `message.sendState`.

Labels:

```text
queued  -> В очереди
sending -> Отправляется
failed  -> Не отправлено
sent + support_unread/none -> Отправлено
sent + support_read -> Прочитано поддержкой
```

The UI may use a compact double-check or text label, but accessible label must
be exact.

- [ ] **Step 3: Keep retry logic**

Update failed text retry checks from `message.status` to `message.sendState`.
Do not change retryability rules.

- [ ] **Step 4: Tests**

Cover:

- sent but unread-by-support message exposes `Отправлено`;
- support-read message exposes `Прочитано поддержкой`;
- queued/sending/failed labels remain unchanged;
- non-retryable failed text copy remains unchanged;
- attachment/voice sent messages can show support receipt if authored by
  current user and backend says read.

Run:

```bash
pnpm --dir frontend exec vitest run src/features/chat/components/ChatTranscript.test.tsx src/features/chat/pages/ChatPage.optimistic-send.test.tsx
pnpm --dir frontend run typecheck
```

Expected: PASS.

Checkpoint commit:

```bash
git add frontend/src/features/chat
git commit -m "feat: show honest chat read receipts"
```

## Task 10: Add Bounded Frontend Receipt Refresh

**Files:**

- Modify or create: `frontend/src/features/chat/api/chatClient.ts`
- Create: `frontend/src/features/chat/lib/chatReceipts.ts`
- Create: `frontend/src/features/chat/lib/chatReceipts.test.ts`
- Create: `frontend/src/features/chat/pages/useChatReceiptRefresh.ts`
- Create: `frontend/src/features/chat/pages/useChatReceiptRefresh.test.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.tsx`

- [ ] **Step 1: Add API client**

Add:

```ts
export async function getChatReceiptState({
  messageIds,
  threadId,
}: {
  messageIds: number[]
  threadId: string
}): Promise<ChatReceiptStateResponse>
```

Call:

```text
POST /api/chat/threads/{threadId}/receipt-state
```

- [ ] **Step 2: Add pure merge helper**

Input:

```ts
mergeMessageReceipts({
  messages,
  receiptState,
})
```

Rules:

- update only matching message ids;
- only replace receipt with a newer/more definitive receipt;
- never downgrade `support_read` to `support_unread`;
- leave queued/sending/failed local messages untouched.

- [ ] **Step 3: Add hook**

`useChatReceiptRefresh` behavior:

- only runs while selected thread is visible and backend is online;
- only runs when ready snapshot has at least one current-user sent message with
  `receipt.kind === 'support_unread'`;
- sends at most 50 visible message ids;
- refresh immediately after a message becomes sent;
- refresh every 30 seconds while useful;
- refresh on visibility regain;
- stop when hidden/offline/no useful messages.

- [ ] **Step 4: Wire ChatPage**

Call hook after snapshot state and optimistic sends are available. It must not
interfere with `useChatForegroundUnreadRefresh`, push stale marker refresh,
outbox drain or snapshot resume refresh.

- [ ] **Step 5: Tests**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/chat/lib/chatReceipts.test.ts src/features/chat/pages/useChatReceiptRefresh.test.tsx src/features/chat/pages/ChatPage.runtime.test.tsx
pnpm --dir frontend run typecheck
```

Expected: PASS.

Checkpoint commit:

```bash
git add frontend/src/features/chat
git commit -m "feat: refresh chat read receipts while visible"
```

## Task 11: Group Read Hardening

**Files:**

- Modify: `backend/src/modules/chat-read-receipts/service.ts`
- Modify: `backend/src/modules/chat-read-receipts/service.test.ts`
- Modify: `backend/src/modules/chat-threads/service.ts` if participant listing
  needs a reusable helper.

- [ ] **Step 1: Keep per-user group rows**

Every group read marker is scoped by:

```text
tenant_id + portal_user_id + portal_chat_thread_id
```

- [ ] **Step 2: Count only current visible members**

If future `group_read_summary` is computed, participants must come from current
group membership via existing Chatwoot contact attributes and active portal
users.

- [ ] **Step 3: Keep MVP UI hidden**

Do not show `Прочитано всеми` or participant counts in message bubbles in this
slice.

- [ ] **Step 4: Tests**

Cover:

- removed group member's old read row is ignored;
- one participant opening group does not move another participant's marker;
- standard Chatwoot group contact last-seen sync is documented as group-level.

Run:

```bash
pnpm --dir backend exec vitest run src/modules/chat-read-receipts/service.test.ts src/modules/chat-threads
```

Expected: PASS.

Checkpoint commit:

```bash
git add backend/src/modules/chat-read-receipts backend/src/modules/chat-threads
git commit -m "feat: harden group chat read markers"
```

## Task 12: Runtime And Production Smoke

**Files:**

- Modify: `docs/product/chat-message-send-ui-scenarios.md`
- Optional: add Playwright test if local Chatwoot test fixture can drive
  support last-seen reliably.

- [ ] **Step 1: Backend targeted tests**

```bash
pnpm --dir backend exec vitest run src/integrations/chatwoot src/modules/chat-read-receipts src/modules/chat-messages src/modules/chat-threads src/modules/chatwoot-webhooks
pnpm --dir backend run typecheck
```

Expected: PASS.

- [ ] **Step 2: Frontend targeted tests**

```bash
pnpm --dir frontend exec vitest run src/features/chat
pnpm --dir frontend run typecheck
```

Expected: PASS.

- [ ] **Step 3: Root checks**

```bash
pnpm lint
git diff --check
```

Expected: PASS.

- [ ] **Step 4: Manual local smoke**

Scenarios:

- private: agent sends message, portal opens private chat, Chatwoot dashboard
  shows agent message read after public last-seen sync;
- private: portal sends message, agent opens Chatwoot conversation, portal
  later shows `Прочитано поддержкой`;
- group: one portal participant opens group, only this user's portal read row
  moves;
- group: standard Chatwoot dashboard read is treated as group-level, not
  per-user;
- offline cached launch does not move read marker;
- push notification alone does not move read marker;
- hidden app does not poll receipt-state aggressively.

- [ ] **Step 5: Production real-device smoke after deploy**

Same scenarios as local smoke, plus:

- iOS PWA visible/hidden behavior;
- Android PWA visible/hidden behavior;
- app with push disabled still refreshes receipts while foreground and online;
- pending push notifications do not change receipt state.

- [ ] **Step 6: Docs update**

Update `docs/product/chat-message-send-ui-scenarios.md` so read receipt rows
move from planned target to actual behavior.

Checkpoint commit:

```bash
git add docs/product/chat-message-send-ui-scenarios.md
git commit -m "docs: document chat read receipt behavior"
```

## Final Review Checklist

- [ ] No browser-direct Chatwoot calls.
- [ ] No Chatwoot core changes.
- [ ] Public message model uses `sendState + receipt`, not overloaded `status`.
- [ ] Opening fresh latest snapshot moves portal read marker.
- [ ] Older pages, cached offline snapshots, push and receipt-state refresh do
      not move read marker.
- [ ] Chatwoot public last-seen failure does not fail the snapshot.
- [ ] `message_updated` still does not create unread.
- [ ] Unread counters and app badges stay independent from receipts.
- [ ] Portal DB has one read row per tenant/user/thread, not per message.
- [ ] Group read wording does not overpromise per-user visibility in standard
      Chatwoot dashboard.
- [ ] Targeted backend/frontend tests pass.
- [ ] Production smoke cases are documented for the user.

## Self-Review

- Spec coverage: persistence, Chatwoot public last-seen sync, support-read
  computation, receipt refresh, group/private semantics, unread separation,
  offline/push boundaries and no-core Chatwoot constraint are covered.
- Placeholder scan: no `TBD`, no undefined future task, no "implement later" as
  required work inside MVP.
- Type consistency: this plan uses `portal_chat_thread_reads`,
  `sendState`, `receipt`, `support_read`, `support_unread` consistently.
