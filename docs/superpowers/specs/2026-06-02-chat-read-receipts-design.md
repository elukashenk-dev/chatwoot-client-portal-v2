# Chat Read Receipts Design

## Scope

Эта спека фиксирует будущую реализацию read receipts в
`chatwoot-client-portal-v2`: пользователь портала и агент поддержки должны
понимать, что их сообщение прочитано.

Важно:

- Chatwoot core в этом slice не меняем.
- Browser не получает Chatwoot authority.
- Portal backend остается единственной authority-зоной для auth, session,
  thread access, send, unread, realtime и Chatwoot API calls.
- Chatwoot остается system of record для conversations, messages и attachments.
- Portal database хранит только portal-owned read state и техническую sync
  metadata.

## Executive Decision

Read receipts реализуем как отдельную модель поверх message send state.

Не делаем так:

```text
message.status = sent/delivered/read
```

Почему: в нашей архитектуре один `status` уже смешивает разные вещи:

- local outbox state: `queued`, `sending`, `failed`;
- backend accepted state: `sent`;
- Chatwoot delivery/read state для agent messages;
- agent dashboard last-seen state для customer messages;
- group per-user read state, которого Chatwoot сам не хранит.

Правильная модель:

```text
sendState     = queued | sending | failed | sent
supportRead   = unread | read
viewerRead    = unread | read
groupRead     = per-user portal-owned state
```

В публичном API это можно отдать как отдельный объект `receipt`, а не
перегружать `status`.

## Recommended Order

Сначала лучше закрыть reliability baseline, затем implement read receipts.

Минимальный обязательный prerequisite перед read receipts:

- успешный исходящий статус UI должен быть `Отправлено`, а не `Доставлено`
  (в текущем `main` уже закрыто);
- перестать трактовать backend accepted message как delivered/read;
- сохранить `queued/sending/failed` как local send states;
- оставить snapshot refresh source of truth для открытого thread.

Полный reliability plan лучше закрыть первым, потому что read receipts зависят
от честного send state, стабильного snapshot refresh и корректной обработки
offline/stale states. Если внедрить read receipts до этого, UI может показать
`Прочитано` поверх сообщения, которое еще находится в плохом local/outbox
состоянии.

Связанные документы:

- `docs/superpowers/specs/2026-06-02-chat-message-reliability-design.md`
- `docs/superpowers/plans/2026-06-02-chat-message-reliability.md`

Они должны оставаться reliability scope. Эта спека добавляет следующий
feature-scope, а не расширяет reliability plan до read receipts.

## Chatwoot Facts

Официальная документация Chatwoot:

- `sent`, `delivered`, `read`, `failed` - разные message statuses;
- Website Widget и API Channel поддерживают message statuses;
- unsupported channels не дают одинаковую гарантию read/delivered.
- `sent` означает, что Chatwoot передал сообщение upstream/channel provider,
  но это не означает доставку до устройства;
- `delivered` означает provider/device delivery confirmation and is not the
  same as `read`;
- `read` depends on channel support and client settings, so it cannot be used
  as a universal business promise without checking the source.

Источник:

- https://developers.chatwoot.com/self-hosted/message-statuses

Факты из `../chatwoot-ce-stable`:

1. Customer/contact read:
   - public API endpoint:
     `POST /public/api/v1/inboxes/:inbox_identifier/contacts/:source_id/conversations/:display_id/update_last_seen`;
   - endpoint обновляет `conversation.contact_last_seen_at`;
   - затем запускает `Conversations::UpdateMessageStatusJob`;
   - job переводит outgoing/template messages до timestamp из `sent/delivered`
     в `read`.

2. Agent read:
   - dashboard endpoint:
     `POST /api/v1/accounts/:account_id/conversations/:display_id/update_last_seen`;
   - endpoint обновляет `agent_last_seen_at`;
   - для assignee также обновляет `assignee_last_seen_at`;
   - Chatwoot dashboard считает unread/read через `agent_last_seen_at`.

3. Message status:
   - `Message.status` enum: `sent`, `delivered`, `read`, `failed`;
   - account API messages response возвращает `status`;
   - account API messages response meta возвращает `agent_last_seen_at` and
     `assignee_last_seen_at`.

4. Events:
   - `message_updated` существует и может обновить snapshot после status
     changes;
   - `contact_last_seen_at` changes могут вызывать `conversation_read`;
   - `agent_last_seen_at` в dashboard controller обновляется через
     `update_columns`, поэтому на него нельзя надежно рассчитывать как на
     webhook/realtime event.

Implication:

- когда portal user открыл chat snapshot, мы можем синхронизировать customer
  read в Chatwoot;
- когда agent открыл conversation в Chatwoot dashboard, portal не всегда
  получит event, поэтому для user-visible `Прочитано поддержкой` нужен
  bounded refresh/polling of receipt metadata.

Important ID detail:

- Chatwoot public docs call the path segment `conversation_id`, but the local
  Chatwoot CE controllers resolve conversations by `display_id`;
- Chatwoot account conversation JSON exposes `id` as `conversation.display_id`;
- current portal `chatwootConversation.id` is therefore the public/display
  conversation id used in Chatwoot account/public API paths, not a browser
  authority and not a value accepted from the frontend.

## Current Portal Baseline

Текущий portal уже имеет часть нужного фундамента:

- `ChatwootMessage.status` парсится из Chatwoot message payload;
- `message_updated` webhook принимается и вызывает fresh snapshot fanout;
- `GET /api/chat/messages` после successful latest snapshot очищает unread;
- `portal_chat_threads` хранит tenant/thread -> Chatwoot conversation mapping;
- group send ledger знает author для group messages;
- `/api/chat/threads` остается source of truth для visible thread list and
  unread totals.
- frontend показывает successful outgoing state как `Отправлено`.
- `findConversationMessageById` уже проверяет конкретный message id внутри
  текущей Chatwoot conversation and can be reused by receipt refresh;
- foreground unread refresh, push stale markers and notification app badges are
  already separate from push delivery.

Текущие gaps:

- `normalizePortalMessageStatus` затирает real Chatwoot status у сообщений
  current portal user в `sent`;
- `ChatwootMessageClient` сейчас возвращает messages only и не выносит
  `agent_last_seen_at` из response meta;
- Chatwoot public API `update_last_seen` требует API channel `identifier`, а
  current client мапит `webhookSecret/webhookUrl`, но не мапит
  `inbox_identifier`;
- для group chats нет per-user read marker;
- нет `receipt-state` endpoint, который обновляет только receipts без очистки
  unread и без движения read marker;
- standard Chatwoot dashboard не умеет показывать per portal user group read
  без Chatwoot customization.

## Definitions

### Sent

`Sent` в portal означает только:

```text
Portal backend accepted request and Chatwoot returned canonical message.
```

UI label: `Отправлено`.

Это не означает:

- агент прочитал;
- агентское устройство получило;
- Chatwoot dashboard открыл conversation;
- все участники группы прочитали.

### Customer Read Agent Message

Portal user прочитал agent message, если:

```text
fresh backend snapshot for the latest selected thread was successfully served
and the message was included at or before the portal read marker.
```

Не используем:

- scroll-to-bottom tracking;
- "прочитал глазами";
- manual `mark read` button;
- cached offline snapshot;
- push notification delivery.

### Agent Read Customer Message

Agent прочитал portal user's message, если:

```text
message.createdAt <= Chatwoot conversation.agent_last_seen_at
```

Для assignee можно хранить/отдавать `assignee_last_seen_at`, но MVP label для
portal user должен быть проще: `Прочитано поддержкой`.

### Group Read

Group read имеет две разные плоскости:

1. Chatwoot group contact read:
   - standard Chatwoot dashboard может знать только group-level signal;
   - без Chatwoot core/custom UI это означает "групповой чат был открыт хотя бы
     одним portal participant", а не "все участники прочитали".

2. Portal per-user group read:
   - portal database хранит read marker на каждого `portal_user_id` and
     `portal_chat_thread_id`;
   - именно это является честным per-user state.

Не обещаем агенту в standard Chatwoot dashboard per-user group receipt. Для
этого в будущем потребуется Chatwoot customization, отдельный agent portal или
другая agent-side интеграция.

## Architecture

### Receipt Sources

Use three receipt sources:

| Source                            | Owner    | Used For                                         |
| --------------------------------- | -------- | ------------------------------------------------ |
| Chatwoot `contact_last_seen_at`   | Chatwoot | Agent sees customer read support messages        |
| Chatwoot `agent_last_seen_at`     | Chatwoot | Customer sees support read customer messages     |
| Portal `portal_chat_thread_reads` | Portal   | Per-user read state, especially group chat reads |

### High-Level Flow

When portal user opens latest thread snapshot:

1. Backend resolves tenant/session/thread access.
2. Backend fetches fresh latest Chatwoot messages snapshot.
3. Backend maps visible messages.
4. Backend updates portal read marker for current user/thread using the newest
   visible message in the snapshot.
5. Backend clears unread for that thread.
6. Backend attempts Chatwoot contact `update_last_seen`.
7. Backend returns snapshot including receipt metadata.

When agent opens conversation in Chatwoot:

1. Chatwoot updates `agent_last_seen_at`.
2. Portal may not receive webhook/realtime event.
3. Portal catches the change through selected-thread receipt refresh or normal
   snapshot refresh.
4. Portal marks matching current-user messages as `readBySupport`.

When Chatwoot marks agent messages as `read`:

1. Chatwoot `UpdateMessageStatusJob` updates message statuses.
2. Chatwoot may send `message_updated`.
3. Portal webhook accepts `message_updated` and refreshes/fans out snapshot.
4. Portal UI can update agent message receipt if needed.

## Data Model

Add a bounded one-row-per-user-thread table:

```text
portal_chat_thread_reads
```

Fields:

```text
id
tenant_id
portal_user_id
portal_chat_thread_id
thread_id
chatwoot_conversation_id
last_read_chatwoot_message_id
last_read_message_created_at
last_opened_at
chatwoot_contact_last_seen_synced_at
chatwoot_contact_last_seen_sync_status
chatwoot_contact_last_seen_sync_error
created_at
updated_at
```

Constraints:

- unique `(tenant_id, portal_user_id, portal_chat_thread_id)`;
- FK `tenant_id -> portal_tenants`;
- FK `portal_user_id -> portal_users`;
- FK `portal_chat_thread_id -> portal_chat_threads`;
- `chatwoot_contact_last_seen_sync_status in ('not_required', 'pending', 'synced', 'failed')`.

Why one row per user/thread:

- no per-message growth;
- no push-delivery-like accumulation;
- group read can be calculated by comparing participant markers to message ids;
- old group membership read rows can stay harmlessly because visible
  membership is resolved from current access rules.

### Why Store Both Message Id And Timestamp

`last_read_chatwoot_message_id` is best for portal comparison because it avoids
over-marking messages that arrive during the same second.

`last_read_message_created_at` is useful for:

- debugging;
- comparing with Chatwoot `agent_last_seen_at`;
- future analytics;
- sync visibility.

Do not use wall-clock `now` alone as the portal read boundary. Use the newest
client-visible message returned by the fresh snapshot.

## Chatwoot Contact Last-Seen Sync

### Required Chatwoot Client Additions

Extend portal Chatwoot client:

1. `ChatwootPortalInboxRouting` or `ChatwootPortalInboxDetails` includes
   `inboxIdentifier`.
   - Comes from Chatwoot account inbox response field `inbox_identifier`.

2. Add contact last-seen method:

```ts
markPublicConversationLastSeen({
  conversationDisplayId,
  inboxIdentifier,
  sourceId,
}: {
  conversationDisplayId: number
  inboxIdentifier: string
  sourceId: string
})
```

Calls:

```text
POST /public/api/v1/inboxes/{inboxIdentifier}/contacts/{sourceId}/conversations/{conversationDisplayId}/update_last_seen
```

No browser call. Portal backend calls this.

### Source Id Resolution

For `private:me`:

- use linked person contact's API channel contact inbox `source_id`;
- create it if missing using current `createContactInbox` behavior.

For `group:<id>`:

- use group contact's API channel contact inbox `source_id`;
- create it if missing using current `createContactInbox` behavior.

This matches current conversation bootstrap behavior.

### Sync Failure Policy

Opening a chat must not fail only because Chatwoot `update_last_seen` failed
after messages were already fetched.

Policy:

- portal read marker update is authoritative for portal UI;
- Chatwoot last-seen sync is attempted synchronously after fresh snapshot;
- if sync fails, snapshot still returns;
- read row records `sync_status = 'failed'` or `pending`;
- next successful latest snapshot/open retries pending sync;
- no unbounded job table is required for MVP.

Reason:

- user experience stays stable if Chatwoot has a transient last-seen issue;
- business-critical Chatwoot dashboard state eventually catches up when the
  user opens or refreshes the thread again;
- persistence remains one row per user/thread.

If production testing shows missed Chatwoot sync is frequent, add a small
bounded backend retry worker later. Do not introduce it in MVP unless needed.

## Backend API Shape

### Snapshot Response

Extend `PortalChatMessage`.

Recommended replacement shape:

```ts
type PortalChatMessage = {
  id: number
  direction: 'incoming' | 'outgoing'
  authorRole: 'agent' | 'group_member' | 'current_user'
  sendState: 'queued' | 'sending' | 'failed' | 'sent'
  receipt: PortalMessageReceipt
  // existing content/attachments/reply fields
}
```

Receipt:

```ts
type PortalMessageReceipt =
  | {
      kind: 'none'
    }
  | {
      kind: 'support_read'
      readAt: string
    }
  | {
      kind: 'support_unread'
    }
  | {
      kind: 'viewer_read'
      readAt: string
    }
  | {
      kind: 'group_read_summary'
      readByCount: number
      totalParticipantCount: number
      readByCurrentUser: boolean
    }
```

No backward compatibility requirement exists, so replacing `status` with
`sendState + receipt` is allowed. If implementation risk is lower, `status` can
remain temporarily inside the same slice, but final public model should not
make one field mean both send and read.

### Snapshot Receipt Context

Add snapshot-level metadata:

```ts
type ChatMessagesSnapshot = {
  receiptState: {
    chatwootContactLastSeenSyncStatus:
      | 'not_required'
      | 'pending'
      | 'synced'
      | 'failed'
    lastReadMessageId: number | null
    supportLastSeenAt: string | null
  }
}
```

Frontend does not need to display sync status by default, but tests and
diagnostics need it.

### Receipt Refresh

Because agent `last_seen` may not produce webhook, use a dedicated receipt
refresh endpoint:

Chosen MVP:

```text
POST /api/chat/threads/:threadId/receipt-state
```

Request body:

```ts
{
  messageIds: number[]
}
```

Rules:

- `messageIds` must be positive integer Chatwoot message ids already visible in
  the selected thread UI;
- backend must still verify every id through current tenant/session/thread
  access and Chatwoot conversation lookup;
- endpoint must not move portal read marker;
- endpoint must not clear unread;
- endpoint must not return new message content.

Response:

```ts
{
  result: 'ready' | 'not_ready' | 'unavailable'
  threadId: string
  supportLastSeenAt: string | null
  messageReceipts: Array<{
    messageId: number
    receipt: PortalMessageReceipt
  }>
}
```

Use it only for currently visible selected thread and only when there are
current-user messages where support receipt could change.

## Backend Receipt Computation

### Current User's Messages

For messages authored by current portal user:

```text
supportLastSeenAt = Chatwoot meta.agent_last_seen_at
if message.createdAt <= supportLastSeenAt:
  receipt = support_read
else:
  receipt = support_unread
```

Rules:

- applies to text, attachments, voice;
- applies to private and group messages authored by current portal user;
- failed/queued/sending local optimistic messages never show `support_read`;
- compare using Chatwoot seconds carefully;
- if timestamp equality is ambiguous, prefer not to overstate read.

### Agent Messages In Private Chat

When current portal user opens latest private snapshot:

- portal updates read marker;
- portal calls Chatwoot public `update_last_seen`;
- Chatwoot dashboard can show agent messages read.

Frontend does not need to show `Прочитано вами` on incoming agent messages.

### Agent Messages In Group Chat

When any allowed portal participant opens latest group snapshot:

- portal updates that participant's read marker;
- portal may call Chatwoot public `update_last_seen` for the group contact;
- standard Chatwoot dashboard can show group-level read.

Important wording:

- standard Chatwoot dashboard read means "the group contact read marker moved";
- portal-owned data is the only precise per-user group read source.

### Other Group Member Messages

For messages by other portal group members:

- current user opening the thread records current user's read marker;
- the sender's read-by-participants summary can be computed from portal rows;
- MVP UI can omit this summary if we want minimal complexity.

Recommended MVP:

- show support read for current user's messages;
- do not show noisy participant read counts in the transcript;
- keep backend per-user group read state ready for future group receipt UI.

## Frontend UX

### Outgoing Current User Message

For current user's sent messages:

```text
queued/sending/failed -> existing local icons and labels
sent                  -> "Отправлено"
support_read          -> "Прочитано поддержкой"
```

Recommended visual behavior:

- keep compact metadata near timestamp;
- use accessible aria labels;
- do not add large text under every message;
- if using icons, tooltip/aria must distinguish `Отправлено` from
  `Прочитано поддержкой`.

### Incoming Agent Message

Do not show `Прочитано вами` in the normal transcript. The fact that the user
opened the chat is enough, and adding this label creates visual noise.

Agent-side read is reflected in Chatwoot dashboard through `update_last_seen`.

### Group Chat

MVP:

- current user's own group messages can show `Прочитано поддержкой` when
  support read is true;
- no participant read counts in message bubbles;
- do not claim `Прочитано всеми` unless backend verifies all currently visible
  participants have read marker >= message id.

Future optional UI:

- message action/details panel can show `Прочитали: Иван, Мария`;
- only current visible group members should count;
- removed members are ignored.

### Offline And Cached Snapshots

Do not mark read when:

- app opens from cached offline snapshot;
- backend returns unavailable/not_ready;
- frontend only receives push;
- user only sees notification;
- service worker handles background push.

Mark read only after successful fresh backend snapshot for the selected
`threadId`.

### Multi-Device

Read state is per portal user, not per device.

If the same user opens a chat on one phone, the user's portal read marker moves
for all devices. This matches normal messenger behavior and avoids storing
unbounded per-device read rows.

## Realtime And Refresh

Receipt changes come through three paths:

1. `message_updated` webhook after Chatwoot status changes.
2. Fresh snapshot when user opens/selects thread.
3. Bounded selected-thread receipt refresh while visible.

Rules:

- no receipt refresh while app is hidden;
- no receipt refresh while backend is known offline;
- do not use push for receipt state;
- do not treat pending push notifications as unread/read source;
- after user sends a message, schedule receipt refresh while visible so
  `Прочитано поддержкой` can appear even if agent only opened the conversation
  and did not reply.

Recommended interval:

- 30 seconds while selected thread is visible and there is at least one
  current-user message not read by support;
- stop when all visible current-user messages are read or page becomes hidden;
- trigger immediate refresh on visibility regain.

This is intentionally conservative. Business gets useful read feedback without
high-frequency polling.

## Interaction With Unread

Unread and read receipts are related but not identical.

Current unread rule remains:

```text
Backend successfully served latest snapshot for threadId -> unread for that
thread is cleared.
```

New read marker rule:

```text
Backend successfully served latest fresh snapshot for threadId -> portal read
marker for current user/thread moves to newest visible message in that snapshot.
```

Important:

- clearing unread should not depend on Chatwoot contact last-seen sync success;
- Chatwoot contact last-seen sync should not create unread;
- `message_updated` for read status must not create unread;
- read receipts must not affect push counters.

## Security And Tenant Boundaries

All receipt operations must be tenant/session/thread scoped.

Required checks:

- tenant resolved by host before auth/chat runtime;
- user session belongs to tenant;
- thread access is resolved through existing `threadId` runtime;
- `portal_chat_thread_reads` reads/writes always include `tenant_id`;
- `chatwoot_conversation_id` is never accepted from browser;
- browser sends only `threadId`;
- Chatwoot public `update_last_seen` is called only by portal backend after
  thread access is verified;
- group membership is resolved from current Chatwoot contact attributes before
  counting participants.

Fail-closed cases:

- invalid thread id;
- removed group membership;
- missing conversation mapping;
- Chatwoot conversation deleted;
- tenant inbox mismatch;
- missing API channel identifier.

## Error Handling

### Snapshot Fails

If latest snapshot fails:

- do not move portal read marker;
- do not clear unread;
- do not call Chatwoot `update_last_seen`;
- frontend keeps previous receipt state.

### Chatwoot Last-Seen Sync Fails

If snapshot succeeds but Chatwoot `update_last_seen` fails:

- return snapshot normally;
- update portal read marker;
- record sync status as `failed` or `pending`;
- retry on next latest snapshot/open;
- do not display a user-facing error by default.

Reason:

The user should not be blocked from reading the chat because a downstream
Chatwoot read-sync call failed after content was already served.

### Receipt Refresh Fails

If receipt refresh fails:

- do not mutate visible receipts to unread;
- keep last known state;
- normal connection UI can show offline/unavailable if backend is unreachable.

## Migration And Backward Compatibility

No product backward compatibility is required.

Allowed:

- add new migration for `portal_chat_thread_reads`;
- replace public message `status` with `sendState + receipt`;
- update frontend tests and fixtures;
- update docs and scenario table.

Not allowed:

- changing Chatwoot database schema;
- changing Chatwoot Rails code;
- exposing Chatwoot ids/tokens to browser;
- direct browser calls to Chatwoot public API.

## Implementation Slices

### Slice 1: Read State Foundation

Backend:

- add `portal_chat_thread_reads` migration/schema/repository;
- update latest snapshot path to move read marker after successful fresh
  snapshot;
- keep unread clear behavior unchanged;
- add tests for private/group marker writes and no-write on cached/unavailable
  snapshots.

Frontend:

- no new UI yet.

### Slice 2: Chatwoot Customer Read Sync

Backend:

- map API channel `inbox_identifier`;
- add Chatwoot client method for public `update_last_seen`;
- resolve/create contact inbox `source_id` for private and group contacts;
- sync after successful latest snapshot;
- record sync status in read row;
- accept sync failure without breaking snapshot.

Tests:

- private chat calls correct public endpoint;
- group chat calls correct public endpoint for group contact;
- missing identifier fails controlled;
- sync failure preserves portal read marker.

### Slice 3: Agent Read Receipts For Portal User

Backend:

- parse `agent_last_seen_at` from Chatwoot messages response meta;
- compute `support_read/support_unread` for current user's messages;
- include receipt data in snapshot.

Frontend:

- display `Отправлено` vs `Прочитано поддержкой`;
- ensure queued/sending/failed do not show support read.

Tests:

- message before `agent_last_seen_at` shows read;
- message after `agent_last_seen_at` shows sent/unread;
- local failed message never shows read.

### Slice 4: Selected Thread Receipt Refresh

Backend:

- expose `POST /api/chat/threads/:threadId/receipt-state`;
- accept visible current-user message ids in the request body;
- verify ids through current tenant/session/thread context and Chatwoot
  conversation lookup;
- return receipt metadata only;
- do not clear unread, move read marker or call Chatwoot `update_last_seen`.

Frontend:

- while visible, refresh receipt state every 30 seconds only when useful;
- trigger refresh after send and on visibility regain;
- stop hidden/offline.

Tests:

- refresh starts after sent message;
- refresh stops when hidden;
- refresh updates receipt without creating unread.

### Slice 5: Group Read Hardening

Backend:

- ensure group read rows are per portal user;
- count only currently visible group participants;
- do not count removed members;
- keep Chatwoot group read wording as group-level only.

Frontend:

- MVP can keep participant read counts hidden.
- If UI is added later, show it in details/action panel, not always in bubble.

## Required Tests

Backend unit/integration:

- repository upsert is tenant-scoped;
- private latest snapshot writes read marker;
- group latest snapshot writes marker for current user only;
- older history page does not move latest read marker;
- unavailable Chatwoot snapshot does not move marker;
- removed group membership cannot move marker;
- duplicate opens update one row, not multiple rows;
- Chatwoot public last-seen URL uses inbox identifier, source id, and display id;
- Chatwoot sync failure records pending/failed without failing snapshot;
- `message_updated` does not create unread;
- `agent_last_seen_at` maps support read correctly.

Frontend unit/component:

- `Отправлено` shown for sent but unread-by-support outgoing message;
- `Прочитано поддержкой` shown after receipt update;
- queued/sending/failed states keep current labels/icons;
- incoming agent messages do not show noisy `Прочитано вами`;
- receipt refresh does not run hidden/offline;
- receipt refresh runs after send while visible.

Manual production smoke:

- private: agent sends message, portal opens chat, Chatwoot dashboard shows
  agent message read;
- private: portal sends message, agent opens Chatwoot conversation, portal
  later shows `Прочитано поддержкой`;
- group: one portal participant opens group, only that user's portal read marker
  moves;
- group: removed participant is not counted;
- offline cached launch does not mark read;
- push notification alone does not mark read;
- hidden app does not poll aggressively.

## Risks

### Standard Chatwoot Dashboard Cannot Show Per-User Group Read

Without Chatwoot core/custom UI, dashboard can only show group-level contact
read. This is acceptable for MVP only if wording stays honest.

Mitigation:

- portal stores exact per-user group read state;
- standard Chatwoot read means group-level read;
- future Chatwoot customization can consume portal read state if needed.

### Agent Last-Seen May Not Emit Webhook

Chatwoot dashboard uses `update_columns` for `agent_last_seen_at`, so portal
cannot rely on webhook for agent-read changes.

Mitigation:

- selected-thread receipt refresh while visible;
- refresh after send and on visibility regain;
- keep interval conservative.

### Time Precision

Chatwoot timestamps are seconds-based in API payloads. Multiple messages can
share the same second.

Mitigation:

- portal read marker uses newest visible `chatwoot_message_id`;
- support read via `agent_last_seen_at` should be conservative on equality if
  ambiguity appears in tests.

### Chatwoot Last-Seen Job Is Async

After public `update_last_seen`, Chatwoot marks messages `read` via a deferred
job.

Mitigation:

- do not expect immediate `message_updated`;
- dashboard state may lag briefly;
- next snapshot/webhook refresh catches final status.

### Group Contact Sync Can Overstate Read In Chatwoot

If one group participant opens the group, Chatwoot group contact
`contact_last_seen_at` moves. Standard dashboard may display read even though
not every participant read.

Mitigation:

- document this as group-level read;
- keep exact per-user truth in portal DB;
- do not label this as "all participants read".

## Acceptance Criteria

- No Chatwoot core changes are made.
- Browser never calls Chatwoot directly.
- Opening a fresh latest private chat snapshot marks agent messages read in
  Chatwoot.
- Portal stores per-user read marker for private and group threads.
- Portal user can see when support read their successfully sent message.
- Local queued/sending/failed messages never show read receipts.
- Offline cached snapshots do not mark messages read.
- Group read state does not claim all participants read unless the backend can
  prove it from current visible participants.
- Unread counters, push notifications and read receipts remain separate systems.
- Read receipt data does not grow per message in portal DB.

## Spec Self-Review

Placeholder scan:

- No `TBD`, `TODO`, or undefined implementation placeholders remain.

Consistency check:

- Chatwoot remains system of record for messages.
- Portal backend remains authority for browser-facing receipts.
- No direct browser Chatwoot authority is introduced.
- Read receipts are separate from reliability send states.

Scope check:

- This is one feature program with bounded slices.
- Chatwoot core customization is explicitly out of scope.
- Group per-user read is supported in portal DB, while Chatwoot dashboard
  limitation is called out.

Ambiguity check:

- `Отправлено` means backend accepted.
- `Прочитано поддержкой` means `agent_last_seen_at` covers the message.
- Customer read means successful fresh latest snapshot, not scroll or push.
- Group Chatwoot read is group-level, not per-user.
