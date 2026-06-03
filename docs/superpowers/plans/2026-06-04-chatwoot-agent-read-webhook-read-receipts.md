# Chatwoot Agent Read Webhook Read Receipts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add business-grade two-check read receipts for portal users by
patching Chatwoot to emit an explicit `conversation_agent_read` webhook when
Chatwoot itself marks a conversation read by an agent.

**Architecture:** Start from clean `main` and discard the previous
polling/`agent_last_seen_at` inference implementation. Chatwoot emits one
explicit read-until event only on a real unread-to-read transition in the
dashboard `update_last_seen` path. The portal receives that external event
through a small adapter, stores a forward-only support-read frontier per
tenant/thread, and renders current-user messages as `support_unread` or
`support_read` from that durable event state.

**Tech Stack:** Chatwoot CE Rails patch, Chatwoot outbound webhooks, Node.js
portal backend, Fastify, Drizzle/Postgres, React 19, Vitest, Playwright runtime
smoke.

---

## Status

This is a replacement plan for the failed plan:

```text
docs/superpowers/plans/2026-06-03-chat-read-receipts-implementation.md
docs/superpowers/specs/2026-06-02-chat-read-receipts-design.md
```

Do not implement this plan on top of any branch from that failed attempt. The
implementation must start from clean `main`.

Current clean baseline for this plan:

```text
main @ ed00297 docs: harden chat read receipts plan
```

## Research Summary

Checked on 2026-06-04 against official Chatwoot docs, local
`../chatwoot-ce-stable` code and public Chatwoot GitHub issues/PRs.

Official Chatwoot sources:

- Webhook docs list `conversation_created`, `conversation_status_changed`,
  `conversation_updated`, `message_created`, `message_updated`,
  `webwidget_triggered`, `contact_created`, `contact_updated` and typing
  events. They do not list an agent-read webhook:
  `https://www.chatwoot.com/docs/product/others/webhook-events`.
- Public `update_last_seen` updates the contact/customer side of a
  conversation:
  `https://developers.chatwoot.com/api-reference/conversations-api/update-last-seen`.
- Message status docs explain `sent`, `delivered`, `read`, `failed`, but those
  statuses are for messages sent through Chatwoot/channel providers, not an
  external "agent read customer message" webhook:
  `https://developers.chatwoot.com/self-hosted/message-statuses`.
- Chatwoot feature copy advertises read receipts/last seen generally, but the
  public webhook contract still lacks an agent-read event:
  `https://www.chatwoot.com/features/read-receipts/`.

Chatwoot code facts from local `../chatwoot-ce-stable`:

- Dashboard agent read is handled by
  `app/controllers/api/v1/accounts/conversations_controller.rb`:
  `update_last_seen` updates `agent_last_seen_at` immediately when unread
  messages exist, otherwise it is throttled.
- That update uses `update_columns`, so it bypasses normal model callbacks that
  could have produced a regular `conversation_updated` webhook.
- Chatwoot already has `conversation.read`, but that is tied to
  `contact_last_seen_at` and is broadcast toward agents when the customer/contact
  read state changes. It is not the missing "agent read customer message" event.
- Chatwoot API inbox webhooks are delivered through `WebhookListener` with
  `deliver_api_inbox_webhooks`; our portal uses the API Channel webhook secret
  for this path.

Community/GitHub signals:

- `chatwoot/chatwoot#12353` is an open feature request named "Webhook for READ
  MESSAGE events" asking for a webhook when a conversation message is read by
  an agent. This is the same product gap.
- `chatwoot/chatwoot#13508` says there is currently no durable way to know
  which users viewed a conversation and when; `agent_last_seen_at` is only one
  overwritten timestamp.
- `chatwoot/chatwoot#13355` throttled `agent_last_seen_at` writes because the
  dashboard previously updated it too often when agents switched conversations.
  Its important rule: unread messages update immediately; no-unread views are
  throttled.

## Why The Previous Plan Failed

The failed implementation tried to deliver a user-visible business receipt
without a deterministic agent-read event. It used several indirect signals:

- Chatwoot `agent_last_seen_at` from message/conversation metadata.
- A portal read-marker table for customer-side read state.
- A `receipt-state` refresh endpoint.
- Frontend receipt polling/refresh while a thread was visible.
- Snapshot merge rules that attempted not to downgrade `support_read`.
- Best-effort Chatwoot public `update_last_seen` sync for customer read.

That architecture failed for business use because it mixed different domains:

- `agent_last_seen_at` is conversation-level dashboard state, not a per-message
  event and not a reliable external webhook source.
- The portal inferred "agent read this message" from a timestamp that can move
  for reasons outside the portal's exact user-visible flow.
- A later message or snapshot refresh could make earlier messages show two
  checks even when the agent had not intentionally opened that private chat in
  the tested scenario.
- The frontend cache/merge layer could preserve an incorrect `support_read`
  state once it appeared.
- The solution added polling and refresh behavior that was hard to explain,
  hard to test manually, and easy to confuse with unread counters, push and
  active-thread notification behavior.
- It also added a new portal DB table whose purpose was broader than the
  customer-facing two-check requirement.

The production smoke proved the core risk: user-visible two checks can be wrong
if the portal maps Chatwoot `agent_last_seen_at` to `support_read` without an
explicit read event. A business chat product cannot show false "read by support"
receipts.

Therefore this plan explicitly rejects:

- polling Chatwoot for `agent_last_seen_at` as the customer-facing read source;
- background `receipt-state` refresh;
- deriving `support_read` directly from Chatwoot message meta;
- portal-side mutation of Chatwoot agent read state;
- reusing the `portal_chat_thread_reads` design from the failed branch.

## Business Definition

For this feature:

```text
Прочитано поддержкой
= Chatwoot dashboard marked this conversation read by an agent through its own
  agent-side update_last_seen flow, and Chatwoot emitted a read-until webhook.
```

This is not a promise that the agent visually read every character. It is the
standard operational definition used by business chat systems: when the agent
has the conversation open and Chatwoot clears unread state, customer messages up
to that read frontier are considered read by support.

## Event Contract

Custom Chatwoot event name:

```text
conversation_agent_read
```

Internal portal event after adapter normalization:

```ts
export type SupportConversationReadEvent = {
  agent: {
    id: number
    name: string | null
  } | null
  chatwootConversationId: number
  readAt: string
  readUntilChatwootMessageId: number
  readUntilMessageCreatedAt: string
  sourceEvent: string
}
```

Expected Chatwoot webhook payload:

```json
{
  "event": "conversation_agent_read",
  "conversation": {
    "id": 101,
    "inbox_id": 7,
    "account_id": 1
  },
  "agent_read": {
    "read_at": "2026-06-04T10:03:12.345Z",
    "read_until_message_id": 500,
    "read_until_message_created_at": "2026-06-04T10:00:01.000Z",
    "unread_incoming_count": 3,
    "performed_by": {
      "id": 42,
      "name": "Support Agent"
    }
  }
}
```

Portal adapter rules:

- Accept `conversation_agent_read`.
- Parse `conversation.id`.
- Parse `agent_read.read_at`.
- Parse `agent_read.read_until_message_id`.
- Parse `agent_read.read_until_message_created_at`.
- Parse `agent_read.performed_by.id/name` for internal audit only.
- Reject/ignore the event if the read-until message id is missing or invalid.
- Do not expose agent identity to portal customers in the UI.
- Keep the adapter extensible so a future upstream event can be mapped into the
  same `SupportConversationReadEvent` type by adding one parser branch.

Future upstream compatibility:

```ts
const CHATWOOT_AGENT_READ_EVENT_NAMES = new Set([
  'conversation_agent_read',
  'conversation_read_by_agent',
  'message_read_by_agent',
])
```

Only `conversation_agent_read` is implemented now. The other names are examples
for the adapter boundary and must not be enabled until an upstream payload is
verified.

## Chatwoot Patch Semantics

Patch the dashboard `update_last_seen` path, not the portal.

Event must fire only when all conditions are true:

- custom event flag is enabled;
- dashboard account conversation endpoint is called by an authenticated agent;
- the conversation had unread incoming customer/contact messages before the
  update;
- `agent_last_seen_at` is successfully updated to a timestamp that covers those
  messages;
- the last unread incoming message before the update is known;
- the conversation belongs to an API inbox or an account webhook subscribed to
  this event.

Event must not fire when:

- the agent clicks an already-read conversation;
- the no-unread one-hour throttle path updates `agent_last_seen_at`;
- the manual `unread` endpoint moves last-seen backwards;
- a private/internal note changes;
- an outgoing agent message is created;
- a bot/system-only change happens without unread incoming customer messages.

Active-chat scenario:

- If the agent is already in the conversation and a customer message arrives,
  Chatwoot currently calls `markMessagesRead` from the active dashboard view.
  The same backend `update_last_seen` path runs.
- The event must fire there too, because Chatwoot itself cleared unread state.

Performance rule from `chatwoot#13355`:

- Do not bypass or weaken the existing throttle.
- Do not add any new Chatwoot DB write.
- Emit the event only from the same branch where Chatwoot already updates
  last-seen because unread messages exist.
- One read event should cover a batch of unread messages by using
  `read_until_message_id`.

## Portal Data Model

Create one durable support-read frontier per tenant/thread:

```sql
CREATE TABLE "portal_chat_support_reads" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL,
  "portal_chat_thread_id" integer NOT NULL,
  "thread_id" text NOT NULL,
  "chatwoot_conversation_id" integer NOT NULL,
  "read_until_chatwoot_message_id" integer NOT NULL,
  "read_until_message_created_at" timestamp with time zone NOT NULL,
  "read_at" timestamp with time zone NOT NULL,
  "source_event" text NOT NULL,
  "source_agent_id" integer,
  "source_agent_name" text,
  "source_delivery_key" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
```

Constraints:

- FK `tenant_id -> portal_tenants.id` restrict.
- FK `portal_chat_thread_id -> portal_chat_threads.id` cascade.
- Unique `(tenant_id, portal_chat_thread_id)`.
- Index `(tenant_id, chatwoot_conversation_id)`.
- Check `read_until_chatwoot_message_id > 0`.

Forward-only rule:

```text
Only move the frontier if the new read_until_chatwoot_message_id is greater
than the stored one.
```

This prevents duplicate, delayed or out-of-order webhook deliveries from
downgrading the portal.

## Public Portal Model

Replace overloaded `status` with separate send and receipt state:

```ts
export type ChatMessageSendState = 'queued' | 'sending' | 'failed' | 'sent'

export type ChatMessageReceipt =
  | { kind: 'none' }
  | { kind: 'support_unread' }
  | { kind: 'support_read'; readAt: string }

export type ChatMessage = {
  sendState: ChatMessageSendState
  receipt: ChatMessageReceipt
}
```

Rules:

- Local optimistic messages use `sendState = queued | sending | failed` and
  `receipt = { kind: 'none' }`.
- Canonical current-user messages use `sendState = 'sent'`.
- Current-user canonical messages use `support_read` when
  `message.id <= supportRead.readUntilChatwootMessageId`.
- Current-user canonical messages use `support_unread` when they are not covered
  by the read frontier.
- Incoming agent messages use `receipt = { kind: 'none' }`.
- Other group members' messages use `receipt = { kind: 'none' }` for the current
  user; they are not rendered as the current user's outgoing messages.

UI labels/icons:

- queued/sending/failed keep the current local icons.
- sent + support_unread: one check, `aria-label="Отправлено"`.
- sent + support_read: two checks, `aria-label="Прочитано поддержкой"`.

## File Structure

Chatwoot patch files in `../chatwoot-ce-stable`:

- Modify: `lib/events/types.rb`
- Modify: `app/controllers/api/v1/accounts/conversations_controller.rb`
- Modify: `app/listeners/webhook_listener.rb`
- Modify: `app/models/webhook.rb`
- Modify:
  `app/javascript/dashboard/routes/dashboard/settings/integrations/Webhooks/WebhookForm.vue`
- Modify relevant locale keys under
  `app/javascript/dashboard/i18n/locale/en/integrations.json` and
  `app/javascript/dashboard/i18n/locale/ru/integrations.json` if the account
  webhook UI is used.
- Test: `spec/controllers/api/v1/accounts/conversations_controller_spec.rb`
- Test: `spec/listeners/webhook_listener_spec.rb`
- Test: `spec/models/webhook_spec.rb`

Portal backend create:

- `backend/src/modules/chat-support-reads/repository.ts`
- `backend/src/modules/chat-support-reads/repository.test.ts`
- `backend/src/modules/chat-support-reads/service.ts`
- `backend/src/modules/chat-support-reads/service.test.ts`
- `backend/src/modules/chatwoot-webhooks/agentReadEvent.ts`
- `backend/src/modules/chatwoot-webhooks/agentReadEvent.test.ts`

Portal backend modify:

- `backend/src/db/schema.ts`
- `backend/drizzle/<next>_chat_support_reads.sql`
- `backend/drizzle/meta/_journal.json`
- `backend/src/modules/chatwoot-webhooks/repository.ts`
- `backend/src/modules/chatwoot-webhooks/repository.test.ts`
- `backend/src/modules/chatwoot-webhooks/service.ts`
- `backend/src/modules/chatwoot-webhooks/service.test.ts`
- `backend/src/modules/chat-messages/types.ts`
- `backend/src/modules/chat-messages/messageMapping.ts`
- `backend/src/modules/chat-messages/messageMapping.test.ts`
- `backend/src/modules/chat-messages/service.ts`
- `backend/src/modules/chat-messages/service.test.ts`
- `backend/src/app.ts`

Portal frontend create:

- `frontend/src/features/chat/lib/chatReceipts.ts`
- `frontend/src/features/chat/lib/chatReceipts.test.ts`

Portal frontend modify:

- `frontend/src/features/chat/types.ts`
- `frontend/src/features/chat/lib/chatSnapshot.ts`
- `frontend/src/features/chat/lib/chatSnapshot.test.ts`
- `frontend/src/features/chat/lib/optimisticTextMessages.ts`
- `frontend/src/features/chat/lib/optimisticTextMessages.test.ts`
- `frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx`
- `frontend/src/features/chat/components/ChatTranscript.test.tsx`
- `frontend/src/features/chat/pages/ChatPage.optimistic-send.test.tsx`
- `frontend/src/features/chat/pages/ChatPage.runtime.test.tsx`

E2E:

- Create: `tests/e2e/chat-agent-read-receipts.spec.ts`

Docs:

- Update: `docs/product/chat-message-send-ui-scenarios.md`
- Update: `docs/roadmap/work-log.md` only after implementation, smoke, review
  and deployment baseline are actually complete.
- If `docs/findings/F-CHAT-RR-001-false-support-read-and-agent-unread.md` is
  present on the implementation branch, delete it only after this new
  event-based implementation is verified and that finding is truly closed.

## Pre-Implementation Reset

This happens after the plan is approved, before any code implementation.

- [ ] **Step 1: Verify current branch and worktree**

Run:

```bash
git status --short --branch
```

Expected: no uncommitted changes except the approved docs plan commit if it is
being committed.

- [ ] **Step 2: Switch to clean main**

Run:

```bash
git switch main
git pull --ff-only
```

Expected: current branch is `main` at the latest remote commit.

- [ ] **Step 3: Drop the failed read-receipts runtime state**

Because the portal has only test users, prefer destructive reset of isolated
portal Postgres rather than trying to preserve the failed migration/table.

Expected result after reset:

- `portal_chat_thread_reads` does not exist.
- Drizzle migrations match `main`.
- Chatwoot core database is not reset as part of portal DB cleanup.

- [ ] **Step 4: Create implementation branches**

Portal branch:

```bash
git switch -c feature/chat-agent-read-receipts
```

Chatwoot patch branch in `../chatwoot-ce-stable`:

```bash
cd ../chatwoot-ce-stable
git status --short --branch
git switch -c feature/conversation-agent-read-webhook
```

Expected: both branches are clean and scoped.

## Task 1: Chatwoot Patch Contract Tests

**Files:**

- Modify: `../chatwoot-ce-stable/spec/controllers/api/v1/accounts/conversations_controller_spec.rb`
- Modify: `../chatwoot-ce-stable/spec/listeners/webhook_listener_spec.rb`
- Modify: `../chatwoot-ce-stable/spec/models/webhook_spec.rb`

- [ ] **Step 1: Add controller test for unread-to-read event**

Add a spec that creates a conversation with:

- `agent_last_seen_at` before a customer incoming message;
- one or more incoming messages after that timestamp;
- authenticated agent opening the conversation via dashboard
  `update_last_seen`.

Expected assertions:

- `CUSTOM_CONVERSATION_AGENT_READ_WEBHOOK_ENABLED` is enabled in the spec;
- `agent_last_seen_at` moves forward;
- a `conversation.agent_read` event is dispatched once;
- event data includes `conversation`, `read_at`, `read_until_message`,
  `unread_incoming_count`, `performed_by`.

- [ ] **Step 2: Add no-unread test**

Add a spec where no incoming message exists after `agent_last_seen_at`.

Expected assertions:

- no `conversation.agent_read` event is dispatched;
- existing one-hour throttle behavior remains unchanged.

- [ ] **Step 3: Add active-chat equivalent test**

Use the same backend endpoint as the dashboard active chat uses. Create an
incoming message after `agent_last_seen_at`, call `update_last_seen`, and assert
the event is dispatched. This represents "agent is already inside the chat and
new customer message arrives".

- [ ] **Step 4: Add disabled-flag test**

With unread incoming messages present and
`CUSTOM_CONVERSATION_AGENT_READ_WEBHOOK_ENABLED=false`, call
`update_last_seen`.

Expected assertions:

- `agent_last_seen_at` still moves forward through Chatwoot's existing path;
- no `conversation.agent_read` event is dispatched.

- [ ] **Step 5: Add listener test**

Add a `WebhookListener` spec for `conversation_agent_read`.

Expected payload:

```ruby
expect(payload[:event]).to eq('conversation_agent_read')
expect(payload[:agent_read][:read_until_message_id]).to eq(message.id)
expect(payload[:agent_read][:performed_by][:id]).to eq(agent.id)
```

- [ ] **Step 6: Add webhook model/UI validation test**

Assert `conversation_agent_read` is accepted as a valid account webhook
subscription. This does not change portal runtime, which uses API Channel
webhook delivery, but keeps the Chatwoot patch complete and inspectable.

- [ ] **Step 7: Run failing tests**

Run in `../chatwoot-ce-stable`:

```bash
bundle exec rspec \
  spec/controllers/api/v1/accounts/conversations_controller_spec.rb \
  spec/listeners/webhook_listener_spec.rb \
  spec/models/webhook_spec.rb
```

Expected: new tests fail because the event does not exist yet.

- [ ] **Smoke Review 1**

Review that tests enforce:

- no event without unread incoming messages;
- no event when the feature flag is disabled;
- event on active-chat read path;
- no dependency on portal code;
- no weakening of `chatwoot#13355` throttling.

Checkpoint commit after implementation and green tests:

```bash
git add .
git commit -m "test: specify conversation agent read webhook"
```

## Task 2: Chatwoot Patch Implementation

**Files:**

- Modify: `../chatwoot-ce-stable/lib/events/types.rb`
- Modify: `../chatwoot-ce-stable/app/controllers/api/v1/accounts/conversations_controller.rb`
- Modify: `../chatwoot-ce-stable/app/listeners/webhook_listener.rb`
- Modify: `../chatwoot-ce-stable/app/models/webhook.rb`
- Modify Chatwoot environment/config surface for
  `CUSTOM_CONVERSATION_AGENT_READ_WEBHOOK_ENABLED`.
- Modify:
  `../chatwoot-ce-stable/app/javascript/dashboard/routes/dashboard/settings/integrations/Webhooks/WebhookForm.vue`
- Modify locale files so account webhook settings show explicit English and
  Russian labels for `conversation_agent_read`.

- [ ] **Step 1: Add event type**

Add:

```ruby
CONVERSATION_AGENT_READ = 'conversation.agent_read'
```

- [ ] **Step 2: Capture unread incoming messages before update**

In `update_last_seen`, before calling `update_last_seen_on_conversation`, compute
the incoming unread scope for the branch that will update immediately.

Implementation shape:

```ruby
if assignee? && @conversation.assignee_unread_messages.any?
  unread_incoming_messages = unread_incoming_messages_for_agent(true)
  return update_last_seen_on_conversation(DateTime.now.utc, true, unread_incoming_messages)
end

if !assignee? && @conversation.unread_messages.any?
  unread_incoming_messages = unread_incoming_messages_for_agent(false)
  return update_last_seen_on_conversation(DateTime.now.utc, false, unread_incoming_messages)
end
```

The helper must filter to customer/contact incoming messages only:

```ruby
def unread_incoming_messages_for_agent(update_assignee)
  scope = update_assignee.present? ? @conversation.assignee_unread_messages : @conversation.unread_messages
  scope.where(account_id: Current.account.id).incoming
end
```

- [ ] **Step 3: Dispatch only after successful last-seen update**

Change `update_last_seen_on_conversation` to accept
`unread_incoming_messages = nil`. After `update_columns`, dispatch only if the
scope contains at least one incoming unread message.

Implementation shape:

```ruby
def update_last_seen_on_conversation(last_seen_at, update_assignee, unread_incoming_messages = nil)
  updates = { agent_last_seen_at: last_seen_at }
  updates[:assignee_last_seen_at] = last_seen_at if update_assignee.present?

  @conversation.update_columns(updates)

  dispatch_conversation_agent_read(last_seen_at, unread_incoming_messages)
end
```

The no-unread throttled branch calls:

```ruby
update_last_seen_on_conversation(DateTime.now.utc, assignee?)
```

and therefore does not emit the event.

- [ ] **Step 4: Build minimal dispatch payload**

Implementation shape:

```ruby
def dispatch_conversation_agent_read(last_seen_at, unread_incoming_messages)
  return unless ActiveModel::Type::Boolean.new.cast(
    ENV.fetch('CUSTOM_CONVERSATION_AGENT_READ_WEBHOOK_ENABLED', 'false')
  )
  return if unread_incoming_messages.blank?

  last_unread_message = unread_incoming_messages.order(created_at: :asc, id: :asc).last
  return if last_unread_message.blank?

  Rails.configuration.dispatcher.dispatch(
    CONVERSATION_AGENT_READ,
    Time.zone.now,
    conversation: @conversation,
    read_at: last_seen_at,
    read_until_message: last_unread_message,
    unread_incoming_count: unread_incoming_messages.count,
    performed_by: Current.user
  )
end
```

- [ ] **Step 5: Add listener method**

Implementation shape:

```ruby
def conversation_agent_read(event)
  conversation = event.data[:conversation]
  inbox = conversation.inbox
  performed_by = event.data[:performed_by]
  read_until_message = event.data[:read_until_message]

  payload = conversation.webhook_data.merge(
    event: __method__.to_s,
    agent_read: {
      read_at: event.data[:read_at].iso8601(3),
      read_until_message_id: read_until_message.id,
      read_until_message_created_at: read_until_message.created_at.iso8601(3),
      unread_incoming_count: event.data[:unread_incoming_count],
      performed_by: performed_by.present? ? { id: performed_by.id, name: performed_by.name } : nil
    }
  )

  deliver_webhook_payloads(payload, inbox)
end
```

- [ ] **Step 6: Add event to allowed account webhooks and settings UI**

Add `conversation_agent_read` to:

- `Webhook::ALLOWED_WEBHOOK_EVENTS`;
- `SUPPORTED_WEBHOOK_EVENTS` in `WebhookForm.vue`;
- English/Russian integration locale labels.

- [ ] **Step 7: Add feature flag config**

Add and document the Chatwoot runtime flag:

```text
CUSTOM_CONVERSATION_AGENT_READ_WEBHOOK_ENABLED=false
```

Default must be disabled. Contract and implementation specs that expect event
delivery explicitly enable it. Specs that verify the disabled path assert that
no `conversation.agent_read` event is dispatched even when unread messages
exist.

- [ ] **Step 8: Run Chatwoot tests**

Run:

```bash
bundle exec rspec \
  spec/controllers/api/v1/accounts/conversations_controller_spec.rb \
  spec/listeners/webhook_listener_spec.rb \
  spec/models/webhook_spec.rb
```

Expected: PASS.

- [ ] **Smoke Review 2**

Review:

- event is disabled by default and enabled only by explicit env flag;
- event sends through `deliver_webhook_payloads`, so API Channel webhook gets it;
- account webhook subscription support is optional but valid;
- event is one per read transition, not one per dashboard click;
- payload has no customer-visible private data requirement;
- existing typing, message and conversation webhook paths are unchanged.

Checkpoint commit:

```bash
git add .
git commit -m "feat: emit conversation agent read webhook"
```

## Task 3: Portal Support Read Persistence

**Files:**

- Create: `backend/src/modules/chat-support-reads/repository.ts`
- Create: `backend/src/modules/chat-support-reads/repository.test.ts`
- Create: `backend/src/modules/chat-support-reads/service.ts`
- Create: `backend/src/modules/chat-support-reads/service.test.ts`
- Modify: `backend/src/db/schema.ts`
- Add: `backend/drizzle/<next>_chat_support_reads.sql`
- Modify: `backend/drizzle/meta/_journal.json`

- [ ] **Step 1: Add failing repository tests**

Tests must cover:

- inserting a first read frontier;
- moving the frontier forward;
- ignoring duplicate/older frontiers;
- tenant isolation;
- conversation lookup by `(tenant_id, portal_chat_thread_id)`.

- [ ] **Step 2: Add schema and migration**

Add `portalChatSupportReads` matching the SQL in `Portal Data Model`.

Generate or manually add the next Drizzle migration from clean `main`.

- [ ] **Step 3: Implement repository**

Repository API:

```ts
export type RecordSupportReadInput = {
  agentId: number | null
  agentName: string | null
  chatwootConversationId: number
  deliveryKey: string | null
  portalChatThreadId: number
  readAt: Date
  readUntilChatwootMessageId: number
  readUntilMessageCreatedAt: Date
  sourceEvent: string
  threadId: string
}

export type ChatSupportReadFrontier = {
  readAt: Date
  readUntilChatwootMessageId: number
  readUntilMessageCreatedAt: Date
}
```

Required methods:

```ts
recordSupportRead(input: RecordSupportReadInput): Promise<'inserted' | 'advanced' | 'ignored'>
getSupportReadForThread(portalChatThreadId: number): Promise<ChatSupportReadFrontier | null>
```

- [ ] **Step 4: Implement service**

Service responsibilities:

- validate event dates and ids;
- call repository forward-only upsert;
- expose `getSupportReadForThread` for message mapping;
- never call Chatwoot;
- never clear unread or push state.

- [ ] **Step 5: Run backend persistence tests**

Run:

```bash
pnpm --dir backend exec vitest run \
  src/modules/chat-support-reads/repository.test.ts \
  src/modules/chat-support-reads/service.test.ts
```

Expected: PASS.

- [ ] **Smoke Review 3**

Review:

- no per-message receipt rows;
- no customer read/contact_last_seen sync;
- forward-only semantics are enforced by DB/service;
- tenant id is present in every query.

Checkpoint commit:

```bash
git add backend/src/db backend/drizzle backend/src/modules/chat-support-reads
git commit -m "feat: persist chat support read frontier"
```

## Task 4: Portal Webhook Adapter And Processing

**Files:**

- Create: `backend/src/modules/chatwoot-webhooks/agentReadEvent.ts`
- Create: `backend/src/modules/chatwoot-webhooks/agentReadEvent.test.ts`
- Modify: `backend/src/modules/chatwoot-webhooks/repository.ts`
- Modify: `backend/src/modules/chatwoot-webhooks/repository.test.ts`
- Modify: `backend/src/modules/chatwoot-webhooks/service.ts`
- Modify: `backend/src/modules/chatwoot-webhooks/service.test.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Add adapter tests**

Tests:

- custom `conversation_agent_read` payload maps to
  `SupportConversationReadEvent`;
- missing `agent_read` is ignored;
- invalid message id is ignored;
- future unknown event names remain unsupported;
- agent name/id are parsed but not required.

- [ ] **Step 2: Implement adapter**

Implementation shape:

```ts
export function mapChatwootAgentReadEvent(
  payload: Record<string, unknown>,
): SupportConversationReadEvent | null
```

Adapter reads only the external payload and returns internal normalized data.
The rest of the portal must never parse `payload.agent_read` directly.

- [ ] **Step 3: Keep delivery status stable**

Keep the existing accepted/ignored delivery status vocabulary and use
`eventName = 'conversation_agent_read'` to distinguish this event in delivery
records. Do not add `accepted_agent_read` or `ignored_agent_read`; this avoids
schema churn unrelated to the read receipt feature. Tests must assert both
status and `eventName`.

- [ ] **Step 4: Process agent-read event**

In `createChatwootWebhookService`:

- include `conversation_agent_read` as supported through adapter;
- validate signature and tenant invariants exactly like message webhooks;
- resolve conversation mapping through
  `findConversationMappingByChatwootConversationId`;
- record delivery before side effects;
- call `chatSupportReadsService.recordSupportRead` with the webhook
  `deliveryKey` stored as `source_delivery_key`;
- publish current snapshots to connected subscribers;
- do not call `chatUnreadService.recordMessageCreatedUnread`;
- do not deliver push notifications.

- [ ] **Step 5: Wire service in `app.ts`**

Create `createChatSupportReadsServiceForRequest` using tenant-scoped repository,
then pass it into `createChatwootWebhookService`.

- [ ] **Step 6: Run webhook tests**

Run:

```bash
pnpm --dir backend exec vitest run \
  src/modules/chatwoot-webhooks/agentReadEvent.test.ts \
  src/modules/chatwoot-webhooks/repository.test.ts \
  src/modules/chatwoot-webhooks/service.test.ts
```

Expected: PASS.

- [ ] **Smoke Review 4**

Review:

- unsupported upstream event names remain ignored;
- duplicate deliveries do not re-fanout;
- message_created behavior for unread/push is unchanged;
- agent-read event never creates unread or push.

Checkpoint commit:

```bash
git add backend/src/modules/chatwoot-webhooks backend/src/modules/chat-support-reads backend/src/app.ts
git commit -m "feat: accept chatwoot agent read webhooks"
```

## Task 5: Backend Message Contract And Mapping

**Files:**

- Modify: `backend/src/modules/chat-messages/types.ts`
- Modify: `backend/src/modules/chat-messages/messageMapping.ts`
- Modify: `backend/src/modules/chat-messages/messageMapping.test.ts`
- Modify: `backend/src/modules/chat-messages/service.ts`
- Modify: `backend/src/modules/chat-messages/service.test.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Add failing mapping tests**

Tests:

- current-user canonical message before support frontier returns
  `sendState: 'sent'` and `receipt.kind: 'support_read'`;
- current-user canonical message after frontier returns
  `receipt.kind: 'support_unread'`;
- incoming agent message returns `receipt.kind: 'none'`;
- local optimistic states are not produced by backend mapping;
- group message authored by another portal user does not show current-user
  support receipt.

- [ ] **Step 2: Replace backend public `status`**

Change `PortalChatMessage`:

```ts
sendState: 'sent'
receipt: PortalChatMessageReceipt
```

Remove public `status` from backend responses in this feature branch. The
project has no real users yet, so do not keep compatibility-only fields.

- [ ] **Step 3: Add mapper context**

Extend `MessageThreadContext`:

```ts
supportReadUntilChatwootMessageId?: number | null
```

Receipt logic:

```ts
if (presentation.authorRole !== 'current_user') return { kind: 'none' }
if (!isPortalSendSourceId(message.sourceId)) return { kind: 'none' }
if (supportReadUntil && message.id <= supportReadUntil) return { kind: 'support_read', readAt }
return { kind: 'support_unread' }
```

Use `readAt` from the stored frontier.

- [ ] **Step 4: Fetch support frontier in service**

In `getCurrentUserChatMessages`, after resolving thread context and before
mapping messages, fetch `chatSupportReadsService.getSupportReadForThread` if the
context has `portalChatThreadId`.

Pass the frontier into `createMessageMapperContext`.

- [ ] **Step 5: Map send results**

When sending text/attachment, the returned canonical message should normally be
`support_unread`. If a very fast agent-read webhook already advanced the
frontier before the send response maps, the mapper may return `support_read`.
That is acceptable and deterministic.

- [ ] **Step 6: Run backend message tests**

Run:

```bash
pnpm --dir backend exec vitest run \
  src/modules/chat-messages/messageMapping.test.ts \
  src/modules/chat-messages/service.test.ts \
  src/modules/chat-support-reads/service.test.ts
```

Expected: PASS.

- [ ] **Smoke Review 5**

Review:

- no `agent_last_seen_at` polling;
- no `receipt-state` endpoint;
- no Chatwoot public `update_last_seen`;
- send ledger remains the source for current-user/group authorship;
- older/cached snapshots cannot invent support-read without persisted frontier.

Checkpoint commit:

```bash
git add backend/src/modules/chat-messages backend/src/modules/chat-support-reads backend/src/app.ts
git commit -m "feat: map support read receipts from webhook state"
```

## Task 6: Frontend Receipt UI

**Files:**

- Create: `frontend/src/features/chat/lib/chatReceipts.ts`
- Create: `frontend/src/features/chat/lib/chatReceipts.test.ts`
- Modify: `frontend/src/features/chat/types.ts`
- Modify: `frontend/src/features/chat/lib/chatSnapshot.ts`
- Modify: `frontend/src/features/chat/lib/chatSnapshot.test.ts`
- Modify: `frontend/src/features/chat/lib/optimisticTextMessages.ts`
- Modify: `frontend/src/features/chat/lib/optimisticTextMessages.test.ts`
- Modify: `frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx`
- Modify: relevant chat page/component tests.

- [ ] **Step 1: Add receipt presentation tests**

Expected labels:

```text
queued -> В очереди
sending -> Отправляется
failed -> Не отправлено
sent + support_unread -> Отправлено
sent + support_read -> Прочитано поддержкой
```

- [ ] **Step 2: Update frontend types**

Replace `status` with:

```ts
sendState: ChatMessageSendState
receipt: ChatMessageReceipt
```

- [ ] **Step 3: Update optimistic messages**

Local optimistic records use:

```ts
sendState: 'queued' | 'sending' | 'failed'
receipt: { kind: 'none' }
```

- [ ] **Step 4: Update snapshot merge**

Realtime and fresh snapshots are allowed to advance receipts from unread to
read. They must not downgrade an already visible `support_read` message if an
older local snapshot arrives later.

Merge helper rule:

```ts
support_read wins over support_unread for the same message id
```

- [ ] **Step 5: Render icons**

`MessageStatusIcon`:

- local pending states keep clock/refresh;
- sent unread renders one check;
- support read renders two checks.

Use the existing icon system. If no double-check icon exists, add a small
two-`CheckIcon` composition in this component instead of adding a global icon.

- [ ] **Step 6: Run frontend tests**

Run:

```bash
pnpm --dir frontend exec vitest run \
  src/features/chat/lib/chatReceipts.test.ts \
  src/features/chat/lib/chatSnapshot.test.ts \
  src/features/chat/lib/optimisticTextMessages.test.ts \
  src/features/chat/components/ChatTranscript.test.tsx \
  src/features/chat/pages/ChatPage.optimistic-send.test.tsx \
  src/features/chat/pages/ChatPage.runtime.test.tsx
```

Expected: PASS.

- [ ] **Smoke Review 6**

Review:

- UI cannot show two checks for queued/sending/failed local messages;
- UI cannot show two checks for incoming agent messages;
- snapshot merge cannot downgrade read to unread;
- no polling hook was added.

Checkpoint commit:

```bash
git add frontend/src/features/chat
git commit -m "feat: render chat support read receipts"
```

## Task 7: Browser Runtime E2E

**Files:**

- Create: `tests/e2e/chat-agent-read-receipts.spec.ts`
- Modify existing E2E helpers only if needed.

- [ ] **Step 1: Add mocked-webhook e2e**

Use portal test harness to simulate:

1. User sends message.
2. Portal shows one check.
3. Test posts signed `conversation_agent_read` webhook for the mapped
   conversation/read-until message.
4. Realtime fanout or refresh updates transcript.
5. Portal shows two checks.

- [ ] **Step 2: Add no-push/no-unread assertion**

Assert the agent-read webhook does not:

- increment portal unread count;
- trigger notification sound;
- create Web Push delivery.

- [ ] **Step 3: Add active-chat scenario**

Simulate user send while support read event arrives shortly after message
creation.

Expected:

- one check may be visible briefly;
- final state is two checks;
- no scroll-to-first-page regression;
- no duplicate messages.

- [ ] **Step 4: Run E2E**

Run:

```bash
pnpm exec playwright test tests/e2e/chat-agent-read-receipts.spec.ts
```

Expected: PASS.

- [ ] **Smoke Review 7**

Review:

- e2e proves event-driven update, not polling;
- active-thread notification behavior remains independent;
- latest/older snapshot behavior remains stable.

Checkpoint commit:

```bash
git add tests/e2e frontend/src/features/chat backend/src/modules
git commit -m "test: cover chat agent read receipt runtime"
```

## Task 8: Local Integration With Patched Chatwoot

**Files:**

- No required repo files unless test docs need updates.

- [ ] **Step 1: Run local services**

Start:

```bash
# Chatwoot in ../chatwoot-ce-stable
make run

# Portal backend
pnpm dev:backend

# Portal frontend
pnpm dev:web --host 0.0.0.0
```

- [ ] **Step 2: Verify webhook config**

In Chatwoot API inbox, confirm webhook URL points to:

```text
https://<tenant-domain>/api/chatwoot/webhooks
```

or local equivalent.

For account webhook UI, confirm `conversation_agent_read` is visible only if
that UI path is intentionally used. Portal runtime should keep using API Channel
webhook.

- [ ] **Step 3: Manual private chat smoke**

Scenario:

1. Agent opens a different Chatwoot conversation.
2. Portal user sends two private-chat messages.
3. Portal shows one check for both.
4. Chatwoot conversation list shows unread count/red marker.
5. Agent opens the private chat.
6. Chatwoot emits `conversation_agent_read`.
7. Portal shows two checks for both messages.

- [ ] **Step 4: Manual active chat smoke**

Scenario:

1. Agent stays in the private Chatwoot chat.
2. Portal user sends a message.
3. Chatwoot briefly shows the new-message/unread marker and clears it through
   `update_last_seen`.
4. Portal receives `conversation_agent_read`.
5. Portal message moves to two checks.

- [ ] **Step 5: Manual group smoke**

Scenario:

1. Agent opens a different Chatwoot conversation.
2. User A sends in group thread.
3. User A sees one check.
4. User B sees User A message as incoming/group-member, not as their own read
   receipt.
5. Agent opens group conversation.
6. User A sees two checks for their own message.

- [ ] **Smoke Review 8**

Review:

- Chatwoot admin unread counters still work;
- portal read receipts do not affect push/unread;
- no white screen on group thread;
- no receipt disappears after refresh/reopen.

Checkpoint commit if docs/test updates were needed:

```bash
git add docs tests
git commit -m "docs: record chat agent read smoke"
```

## Task 9: Production Rollout Plan

This task is performed only after local integration is green and code review
findings are closed or explicitly deferred.

- [ ] **Step 1: Deploy portal first**

Deploy portal event adapter and support-read persistence first. If Chatwoot has
not yet been patched, no `conversation_agent_read` event arrives and behavior
stays at one check.

- [ ] **Step 2: Deploy Chatwoot patch with event disabled**

Recommended Chatwoot env:

```text
CUSTOM_CONVERSATION_AGENT_READ_WEBHOOK_ENABLED=false
```

Start patched Chatwoot, verify normal `message_created/message_updated` webhook
delivery still works.

- [ ] **Step 3: Enable event**

Set:

```text
CUSTOM_CONVERSATION_AGENT_READ_WEBHOOK_ENABLED=true
```

Restart only the required Chatwoot web/worker processes.

- [ ] **Step 4: Production smoke**

Run manual cases from Task 8 on production test users.

Required success:

- private inactive-agent case works;
- active-agent case works;
- group thread does not blank screen;
- Chatwoot agent unread counters remain correct before opening;
- no notifications when user is already in active portal chat;
- no receipt polling/network storm.

- [ ] **Step 5: Rollback path**

If production smoke fails:

1. Disable Chatwoot custom event flag.
2. Redeploy/rollback portal to previous clean main if needed.
3. Keep `portal_chat_support_reads` table temporarily; it is inert if portal
   code does not read it.
4. If full destructive cleanup is desired, reset portal DB because there are no
   real users yet.

- [ ] **Smoke Review 9**

Review production evidence before merging:

- screenshots/video of one-check before agent opens and two-check after;
- Chatwoot webhook delivery logs for `conversation_agent_read`;
- portal backend logs without errors;
- DB row in `portal_chat_support_reads` advanced exactly once per read frontier;
- push/unread counts unchanged by agent-read event.

Checkpoint commit/merge only after this review.

## Task 10: Documentation And Finding Closure

**Files:**

- Modify: `docs/product/chat-message-send-ui-scenarios.md`
- Modify: `docs/roadmap/work-log.md`
- Delete when closed if present:
  `docs/findings/F-CHAT-RR-001-false-support-read-and-agent-unread.md`

- [ ] **Step 1: Update product scenarios**

Document:

- one check = sent/accepted by backend/Chatwoot;
- two checks = support read event from Chatwoot;
- no polling;
- group behavior;
- active-agent behavior.

- [ ] **Step 2: Run docs preservation audit before deleting finding**

Run:

```bash
git status --short --branch
git log --all -- docs/findings/F-CHAT-RR-001-false-support-read-and-agent-unread.md
rg "F-CHAT-RR-001|false-support-read|agent-unread|chat read receipts" docs
```

Delete the finding only if this implementation has verified the acceptance
criteria with the new event source. If the file is absent, record nothing here;
do not recreate it just to delete it.

- [ ] **Step 3: Update work-log**

Add only one concise durable baseline entry after implementation, tests, smoke
and review are complete. Do not list commands or smoke minutiae.

- [ ] **Step 4: Final checks**

Run:

```bash
git diff --check
pnpm --dir backend test
pnpm --dir frontend test
pnpm exec playwright test tests/e2e/chat-agent-read-receipts.spec.ts
```

Expected: PASS, or a precise blocker documented before stopping.

- [ ] **Smoke Review 10**

Final review:

- implementation matches this plan;
- no leftover polling/receipt-state endpoint;
- no old `portal_chat_thread_reads` migration/table in the intended clean DB;
- no compatibility-only `status` field kept for browser messages;
- Chatwoot patch remains small and reviewable.

Final checkpoint commits:

```bash
git add docs
git commit -m "docs: document chat agent read receipts"
```

## Acceptance Criteria

- User-visible two checks are based only on durable
  `conversation_agent_read`/adapter-normalized events.
- Agent outside chat: portal messages stay one-check until agent opens that
  Chatwoot conversation.
- Agent already in chat: new portal message becomes two-check after Chatwoot's
  active conversation read path emits the event.
- Chatwoot admin unread counters/red markers are not cleared by portal code.
- Agent-read events do not create portal unread, sounds or push notifications.
- Duplicate or older read webhooks do not downgrade state or create duplicate
  fanout.
- Group chats do not blank screen and only the current user's own messages show
  their support-read receipt.
- Portal browser never receives Chatwoot authority.
- Portal does not poll Chatwoot for read receipts.
- The custom Chatwoot event can be disabled independently.
- The portal adapter can be extended to a future upstream Chatwoot event by
  changing one parser module, not the whole receipt system.

## Explicit Non-Goals

- Do not implement agent-side "customer read support message" receipts in this
  slice.
- Do not use Chatwoot public `update_last_seen` from the portal in this slice.
- Do not add per-user group read UI for agents in Chatwoot dashboard.
- Do not modify Chatwoot message status enum.
- Do not expose agent name in portal UI.
- Do not keep browser compatibility fields from the old public message contract.
- Do not preserve failed-branch migration/data.

## Suggested Branch And Commit Strategy

Portal:

```text
feature/chat-agent-read-receipts
```

Chatwoot:

```text
feature/conversation-agent-read-webhook
```

Commit after every completed task and smoke review. Do not merge portal changes
until the Chatwoot patch and portal adapter pass local integration together.

Suggested order:

1. Chatwoot contract tests.
2. Chatwoot patch.
3. Portal persistence.
4. Portal webhook adapter.
5. Backend public message mapping.
6. Frontend UI.
7. E2E.
8. Local patched-Chatwoot smoke.
9. Production smoke.
10. Docs/finding closure.
