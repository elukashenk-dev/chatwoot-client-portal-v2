# Уведомления чата Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать блок "Уведомления" в клиентском портале: глобальную страницу `Настройки -> Уведомления`, страницу настроек конкретного чата, звук новых сообщений внутри портала и browser/PWA push-уведомления без раскрытия содержимого сообщений в push payload.

**Architecture:** Portal backend остается единственной authority-зоной. Browser работает только через portal API и service worker. Chatwoot webhook `message_created` становится источником push-доставки, но realtime и история чата не должны зависеть от успешности push. Настройки хранятся tenant-aware в isolated portal Postgres как global user defaults плюс nullable thread overrides. Browser/device push subscription отделен от global/thread preferences.

**Tech Stack:** Fastify, TypeScript, Drizzle/Postgres, Chatwoot API adapter, React, Vite, service worker, Web Push API, Playwright, Vitest.

---

## Scope

Входит в первый slice:

- Пункт меню `Уведомления` в шапке чата.
- Верхнеуровневый пункт `Настройки` и страница `Настройки -> Уведомления`.
- Full-screen page `Уведомления` для текущего чата.
- Настройки:
  - `Новые сообщения` как global master switch и thread-level override.
  - `Звук` как global default и thread-level override для in-portal sound.
  - `Push-уведомления` как global default и thread-level override.
  - `Отключить push на этом устройстве` как device-level действие.
- Backend API для чтения и изменения настроек.
- Backend API для VAPID public key и push subscription lifecycle.
- Tenant-aware persistence для preferences, subscriptions и delivery dedupe.
- Push delivery из Chatwoot webhook `message_created`.
- Generic push payload без текста сообщения, автора, имени файла, Chatwoot IDs и `threadId`.
- Service worker `push` и `notificationclick`.
- Frontend звук для новых входящих сообщений в текущем активном чате.
- Unit/integration tests и targeted Playwright e2e.

Не входит в первый slice:

- Email-уведомления, рассылки, digest.
- Offline Chatwoot email flow.
- Push по `message_updated`.
- Deep link сразу в конкретный чат из push.
- Текст сообщения, автор или вложение в системном уведомлении.
- Notification inbox/center со списком всех событий.

---

## Baseline Before Implementation

- Branch: `feature/chat-notifications`.
- Spec source: `docs/superpowers/specs/2026-05-23-chat-notifications-design.md`.
- Governance source: `AGENTS.md`.
- Related open findings before work:
  - `docs/findings/F-AUTH-001-rate-limit-shared-store.md`
  - `docs/findings/F-CHAT-UI-003-audio-attachment-narrow-width.md`
  - `docs/findings/F-IOS-001-keyboard-textarea-viewport-pan.md`
  - `docs/findings/F-MT-004-admin-chatwoot-token-boundary.md`
- Эти findings не входят в текущий scope, если во время реализации не будет прямого конфликта.

Run before first code edit:

```bash
git status --short --branch
pnpm install --frozen-lockfile
pnpm --dir backend test -- --run
pnpm --dir frontend test -- --run
```

Expected:

- `git status` не содержит unrelated/unclear changes.
- Existing tests либо проходят, либо текущий blocker фиксируется до начала feature edits.

---

## Task 1: Backend Push Environment Contract

**Goal:** Добавить явный env contract для Web Push без включения push, если VAPID keys не настроены.

Files:

- `backend/package.json`
- `pnpm-lock.yaml`
- `backend/src/config/env.ts`
- `backend/src/config/env.test.ts`
- `backend/src/test/appTestHelpers.ts`
- `.env.example`
- `.env.production.example`

Steps:

- [ ] Добавить dependency для отправки Web Push:

```bash
pnpm --dir backend add web-push
pnpm --dir backend add -D @types/web-push
```

- [ ] В `backend/src/config/env.ts` добавить optional env поля:

```ts
pushVapidPublicKey: string | null
pushVapidPrivateKey: string | null
pushVapidSubject: string | null
pushVapidKeyId: string | null
```

- [ ] В schema validation добавить raw env names:

```ts
PUSH_VAPID_PUBLIC_KEY
PUSH_VAPID_PRIVATE_KEY
PUSH_VAPID_SUBJECT
PUSH_VAPID_KEY_ID
```

- [ ] Validation rule:
  - `PUSH_VAPID_PUBLIC_KEY` и `PUSH_VAPID_PRIVATE_KEY` должны быть заданы вместе.
  - Если задана хотя бы одна VAPID key, `PUSH_VAPID_SUBJECT` обязателен.
  - `PUSH_VAPID_KEY_ID` optional; если не задан, backend позже выведет stable key id из public key fingerprint.
  - Если VAPID env отсутствует полностью, push endpoints работают в режиме `unavailable`, а остальной чат не деградирует.

- [ ] Обновить test env в `backend/src/test/appTestHelpers.ts`, чтобы тесты без push продолжали стартовать.
- [ ] Добавить unit tests на env validation:
  - keys отсутствуют: valid, push disabled.
  - public без private: invalid.
  - private без public: invalid.
  - keys без subject: invalid.
  - keys + subject: valid.

Verification:

```bash
pnpm --dir backend test -- env --run
```

Expected:

- Env tests pass.
- Backend app может стартовать без VAPID keys.

Checkpoint:

- После Task 1 проверить `git diff -- backend/src/config/env.ts backend/src/config/env.test.ts backend/src/test/appTestHelpers.ts backend/package.json pnpm-lock.yaml`.

---

## Task 2: Database Schema And Migration

**Goal:** Добавить tenant-aware persistence для global defaults, thread overrides, subscriptions и push delivery dedupe.

Files:

- `backend/src/db/schema.ts`
- `backend/drizzle/*.sql`
- `backend/drizzle/meta/_journal.json`
- `backend/drizzle/meta/*.json`

Tables:

### `portal_user_notification_preferences`

Fields:

```ts
id serial primary key
tenant_id integer not null references tenants(id)
portal_user_id integer not null references portal_users(id)
new_messages_enabled boolean not null default true
sound_enabled boolean not null default true
push_enabled boolean not null default false
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Constraints/indexes:

```ts
unique(tenant_id, portal_user_id)
index(tenant_id, portal_user_id)
```

Notes:

- This table stores global defaults for all chats of a portal user in the current tenant.
- Defaults keep sound enabled for in-portal messages but push disabled until explicit browser permission/subscription.

### `portal_chat_notification_preferences`

Fields:

```ts
id serial primary key
tenant_id integer not null references tenants(id)
portal_user_id integer not null references portal_users(id)
thread_id text not null
new_messages_enabled_override boolean
sound_enabled_override boolean
push_enabled_override boolean
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Constraints/indexes:

```ts
unique(tenant_id, portal_user_id, thread_id)
index(tenant_id, portal_user_id)
```

Notes:

- `thread_id` is portal public thread id, because frontend settings are scoped to route-level thread identity.
- Nullable override fields mean `null = inherit global setting`.
- `true` enables the channel for the thread only when global `new_messages_enabled` is not hard off.
- `false` disables the channel for the thread.

### `portal_push_subscriptions`

Fields:

```ts
id serial primary key
tenant_id integer not null references tenants(id)
portal_user_id integer not null references portal_users(id)
endpoint text not null
p256dh text not null
auth text not null
vapid_key_id text not null
vapid_public_key_fingerprint text not null
user_agent text
status text not null default 'active'
last_error text
last_error_at timestamptz
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Constraints/indexes:

```ts
unique(tenant_id, portal_user_id, endpoint)
check(status in ('active', 'expired', 'disabled'))
index(tenant_id, portal_user_id, status)
index(tenant_id, status)
```

Notes:

- `endpoint` is unique only inside tenant/user scope to avoid cross-tenant coupling.
- `vapid_key_id` and `vapid_public_key_fingerprint` are stored for rotation diagnostics.
- Disabling a single chat never deletes rows here.

### `portal_push_deliveries`

Fields:

```ts
id serial primary key
tenant_id integer not null references tenants(id)
portal_user_id integer not null references portal_users(id)
portal_chat_thread_id integer references portal_chat_threads(id)
thread_id text not null
chatwoot_message_id bigint not null
subscription_id integer references portal_push_subscriptions(id)
status text not null
error_code text
created_at timestamptz not null default now()
```

Constraints/indexes:

```ts
unique(
  tenant_id,
  portal_user_id,
  thread_id,
  chatwoot_message_id,
  subscription_id,
)
check(status in ('sent', 'skipped', 'failed', 'expired'))
index(tenant_id, thread_id, chatwoot_message_id)
index(tenant_id, portal_user_id, created_at)
```

Notes:

- `chatwoot_message_id` is required. Webhook without message id cannot send push.
- Dedupe is per user/thread/message/subscription.

Steps:

- [ ] Add Drizzle table definitions.
- [ ] Generate migration:

```bash
pnpm --dir backend db:generate
```

- [ ] Inspect generated SQL manually:
  - no destructive migration;
  - all four tables are tenant-aware;
  - unique/check/index constraints present;
  - no generated change to unrelated tables.

- [ ] Run backend tests with migration-backed test database:

```bash
pnpm --dir backend test -- --run
```

Expected:

- PGlite test database applies the new migration.
- Existing backend tests still pass.

Checkpoint:

- If migration output contains unexpected table rewrites, stop and fix schema before continuing.

---

## Task 3: Backend Global And Thread Notification Settings API

**Goal:** Реализовать API чтения и изменения global defaults и thread overrides через portal backend authority.

Files:

- `backend/src/modules/chat-notifications/types.ts`
- `backend/src/modules/chat-notifications/repository.ts`
- `backend/src/modules/chat-notifications/service.ts`
- `backend/src/modules/chat-notifications/routes.ts`
- `backend/src/modules/chat-notifications/index.ts`
- `backend/src/app.ts`
- `backend/src/modules/chat-notifications/service.test.ts`
- `backend/src/modules/chat-notifications/routes.test.ts`

API:

```http
GET /api/notifications/settings
PATCH /api/notifications/settings
GET /api/chat/threads/:threadId/notification-settings
PATCH /api/chat/threads/:threadId/notification-settings
```

Global response:

```json
{
  "newMessagesEnabled": true,
  "soundEnabled": true,
  "pushEnabled": false,
  "browserPush": {
    "supported": true,
    "configured": true,
    "permission": "default",
    "subscribed": false
  }
}
```

Thread response:

```json
{
  "threadId": "group:155",
  "global": {
    "newMessagesEnabled": true,
    "soundEnabled": true,
    "pushEnabled": false
  },
  "overrides": {
    "newMessagesEnabled": null,
    "soundEnabled": false,
    "pushEnabled": null
  },
  "effective": {
    "newMessagesEnabled": true,
    "soundEnabled": false,
    "pushEnabled": false
  },
  "browserPush": {
    "supported": true,
    "configured": true,
    "permission": "default",
    "subscribed": false
  }
}
```

Thread PATCH body:

```json
{
  "newMessagesEnabled": null,
  "soundEnabled": false,
  "pushEnabled": null
}
```

Rules:

- [ ] Use current portal session auth.
- [ ] Global GET returns defaults if `portal_user_notification_preferences` row does not exist.
- [ ] Global PATCH accepts partial booleans and upserts row.
- [ ] Thread GET validates tenant and current user through existing thread authority:
  - use `getCurrentUserThreadContext` or the same service boundary used by chat messages;
  - user must have access to private/group thread.
- [ ] Thread GET returns inherited global values when override row does not exist.
- [ ] Thread PATCH accepts partial override values where `boolean` stores override and `null` resets field to inherited global setting.
- [ ] Global `newMessagesEnabled=false` is a hard off for all chats:
  - sound does not play even if thread override `soundEnabled=true`;
  - push delivery skips even if thread override `pushEnabled=true`.
- [ ] Thread effective `newMessagesEnabled=false` forces interruptive behavior off for that thread:
  - sound does not play even if `soundEnabled=true`;
  - push delivery skips even if `pushEnabled=true`;
  - stored `soundEnabled` and `pushEnabled` values may remain unchanged for future re-enable.
- [ ] Do not expose Chatwoot IDs or direct Chatwoot authority.

Implementation shape:

```ts
export type UserNotificationSettings = {
  newMessagesEnabled: boolean
  soundEnabled: boolean
  pushEnabled: boolean
}

export type ChatNotificationSettings = {
  threadId: string
  global: UserNotificationSettings
  overrides: {
    newMessagesEnabled: boolean | null
    soundEnabled: boolean | null
    pushEnabled: boolean | null
  }
  effective: UserNotificationSettings
}
```

Effective calculation:

```ts
export function resolveEffectiveChatNotificationSettings(input: {
  global: UserNotificationSettings
  overrides: ChatNotificationSettings['overrides']
}): UserNotificationSettings {
  const newMessagesEnabled =
    input.global.newMessagesEnabled &&
    (input.overrides.newMessagesEnabled ?? true)

  return {
    newMessagesEnabled,
    soundEnabled:
      newMessagesEnabled &&
      (input.overrides.soundEnabled ?? input.global.soundEnabled),
    pushEnabled:
      newMessagesEnabled &&
      (input.overrides.pushEnabled ?? input.global.pushEnabled),
  }
}
```

```ts
export class ChatNotificationSettingsService {
  async getGlobalSettings(input: {
    tenantId: number
    portalUserId: number
  }): Promise<UserNotificationSettings>

  async updateGlobalSettings(input: {
    tenantId: number
    portalUserId: number
    patch: Partial<UserNotificationSettings>
  }): Promise<UserNotificationSettings>

  async getSettings(input: {
    tenantId: number
    portalUserId: number
    threadId: string
  }): Promise<ChatNotificationSettings>

  async updateSettings(input: {
    tenantId: number
    portalUserId: number
    threadId: string
    patch: Partial<
      Pick<
        ChatNotificationSettings['overrides'],
        'newMessagesEnabled' | 'soundEnabled' | 'pushEnabled'
      >
    >
  }): Promise<ChatNotificationSettings>
}
```

Tests:

- [ ] GET default global settings.
- [ ] PATCH persists partial global settings.
- [ ] GET default private chat settings.
- [ ] GET default group chat settings.
- [ ] GET thread settings returns global + null overrides + effective values.
- [ ] PATCH persists partial thread overrides.
- [ ] PATCH with `null` resets specific thread override to inherited global setting.
- [ ] User cannot read another tenant's thread settings.
- [ ] User cannot update a thread without authority.
- [ ] Global `newMessagesEnabled=false` makes thread effective sound/push false even when thread channel overrides are true.
- [ ] Thread `newMessagesEnabled=false` does not erase stored `soundEnabled` and `pushEnabled` overrides.

Verification:

```bash
pnpm --dir backend test -- chat-notifications --run
```

Expected:

- Settings service/routes tests pass.

Checkpoint:

- Review API shape before integrating frontend.

---

## Task 4: Backend Push Subscription API

**Goal:** Реализовать browser/device subscription lifecycle отдельно от thread preferences.

Files:

- `backend/src/modules/chat-notifications/vapid.ts`
- `backend/src/modules/chat-notifications/pushSubscriptionService.ts`
- `backend/src/modules/chat-notifications/routes.ts`
- `backend/src/modules/chat-notifications/pushSubscriptionService.test.ts`
- `backend/src/modules/chat-notifications/routes.test.ts`
- `backend/src/app.ts`

API:

```http
GET /api/notifications/push/public-key
POST /api/notifications/push/subscriptions
DELETE /api/notifications/push/subscriptions
```

`GET /public-key` response when configured:

```json
{
  "available": true,
  "publicKey": "BEXAMPLE_PUBLIC_KEY_VALUE",
  "vapidKeyId": "sha256-0123456789abcdef",
  "publicKeyFingerprint": "sha256-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
}
```

`GET /public-key` response when not configured:

```json
{
  "available": false
}
```

`POST /subscriptions` body:

```json
{
  "endpoint": "https://push.example/subscription",
  "keys": {
    "p256dh": "base64",
    "auth": "base64"
  }
}
```

`DELETE /subscriptions` body:

```json
{
  "endpoint": "https://push.example/subscription"
}
```

Rules:

- [ ] All endpoints require portal auth and tenant context.
- [ ] Public key endpoint is tenant-scoped by auth but returns deployment-level key.
- [ ] POST is an upsert by `(tenant_id, portal_user_id, endpoint)`.
- [ ] POST stores current `vapid_key_id` and public key fingerprint.
- [ ] DELETE marks subscription `disabled`, not hard-delete.
- [ ] If push is not configured, POST returns `409` with stable error code `push_not_configured`.
- [ ] Invalid subscription body returns `400`.
- [ ] No Chatwoot authority or secrets are exposed.

Implementation shape:

```ts
export type BrowserPushSubscriptionInput = {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
  userAgent: string | null
}
```

```ts
export function createVapidConfig(env: PortalEnv): VapidConfig | null {
  if (
    !env.pushVapidPublicKey ||
    !env.pushVapidPrivateKey ||
    !env.pushVapidSubject
  ) {
    return null
  }

  const fingerprint = createHash('sha256')
    .update(env.pushVapidPublicKey)
    .digest('hex')
  return {
    publicKey: env.pushVapidPublicKey,
    privateKey: env.pushVapidPrivateKey,
    subject: env.pushVapidSubject,
    keyId: env.pushVapidKeyId ?? `sha256-${fingerprint.slice(0, 16)}`,
    publicKeyFingerprint: `sha256-${fingerprint}`,
  }
}
```

Tests:

- [ ] Public key unavailable without VAPID config.
- [ ] Public key available with VAPID config.
- [ ] POST upserts active subscription.
- [ ] POST rejects when VAPID unavailable.
- [ ] DELETE disables only current tenant/current user endpoint.
- [ ] Another tenant cannot disable the same endpoint row.

Verification:

```bash
pnpm --dir backend test -- chat-notifications --run
```

Expected:

- Subscription lifecycle tests pass.

Checkpoint:

- Confirm browser subscription is not coupled to a single chat preference.

---

## Task 5: Backend Push Recipient Resolver

**Goal:** Определить получателей push безопасно и tenant-aware для private и group chats.

Files:

- `backend/src/modules/chat-notifications/recipientResolver.ts`
- `backend/src/modules/chat-notifications/recipientResolver.test.ts`
- `backend/src/modules/chat-notifications/repository.ts`
- `backend/src/modules/chatwoot-webhooks/repository.ts`

Rules:

- [ ] Private chat:
  - recipient is `portal_chat_threads.portal_user_id` from the mapped private thread;
  - user must be active;
  - skip author if send ledger maps webhook `chatwoot_message_id` to current portal user.

- [ ] Group chat:
  - start from tenant-scoped active portal contact links;
  - for each candidate, load current Chatwoot contact through existing Chatwoot client boundary;
  - validate current portal person attributes;
  - include candidate only if current `groupContactIds` includes the group contact id;
  - skip invalid/missing/stale contact state;
  - skip author via send ledger;
  - use bounded concurrency, batch size `5`;
  - if resolver cannot safely validate membership for the group, return no push recipients for that webhook and keep realtime unaffected.

- [ ] Do not trust stale portal-only group membership rows for push recipients.
- [ ] Do not send push for webhook without non-null `chatwoot_message_id`.

Implementation shape:

```ts
export type PushRecipient = {
  tenantId: number
  portalUserId: number
  threadId: string
  portalChatThreadId: number
}
```

```ts
export class ChatNotificationRecipientResolver {
  async resolveRecipients(input: {
    tenantId: number
    accountId: number
    threadMapping: ChatwootConversationThreadMapping
    chatwootMessageId: number
  }): Promise<PushRecipient[]>
}
```

Tests:

- [ ] Private thread resolves mapped active user.
- [ ] Private thread skips inactive user.
- [ ] Private thread skips author.
- [ ] Group thread includes only users whose current Chatwoot person attributes still include the group contact.
- [ ] Group thread skips stale local link if Chatwoot no longer confirms membership.
- [ ] Group thread skips author.
- [ ] Group resolver returns empty list on Chatwoot lookup failure instead of throwing through webhook handling.
- [ ] Resolver never returns users from another tenant.

Verification:

```bash
pnpm --dir backend test -- recipientResolver --run
```

Expected:

- Recipient resolver tests pass.

Checkpoint:

- This task is the main security boundary for multi-tenant push delivery. Review before connecting sender.

---

## Task 6: Backend Push Delivery Service

**Goal:** Отправлять generic Web Push notifications to eligible active subscriptions with dedupe and failure handling.

Files:

- `backend/src/modules/chat-notifications/pushDeliveryService.ts`
- `backend/src/modules/chat-notifications/pushTransport.ts`
- `backend/src/modules/chat-notifications/pushDeliveryService.test.ts`
- `backend/src/modules/chat-notifications/repository.ts`

Payload:

```json
{
  "type": "chat_message",
  "tenantSlug": "buhfirma",
  "url": "/"
}
```

Rules:

- [ ] Deliver only when VAPID is configured.
- [ ] Deliver only for `message_created`.
- [ ] Deliver only when webhook has non-null `chatwoot_message_id`.
- [ ] For each recipient:
  - load global settings for `(tenant_id, portal_user_id)`;
  - load thread overrides for `(tenant_id, portal_user_id, thread_id)`;
  - compute effective settings;
  - skip when effective `new_messages_enabled=false`;
  - skip when effective `push_enabled=false`;
  - load active subscriptions for that user and tenant;
  - insert/send delivery per subscription with unique dedupe key.

- [ ] Push payload must not contain:
  - message text;
  - author name;
  - attachment filename;
  - Chatwoot account/conversation/message IDs;
  - portal `threadId`.

- [ ] Sending errors:
  - HTTP `404`/`410`: mark subscription `expired`, delivery `expired`;
  - other errors: mark delivery `failed`, keep subscription active with `last_error`;
  - errors never fail webhook response after realtime has been published.

- [ ] If there are zero recipients or zero subscriptions, return clean summary.

Implementation shape:

```ts
export type PushDeliverySummary = {
  recipients: number
  subscriptions: number
  sent: number
  skipped: number
  failed: number
  expired: number
}
```

```ts
export class ChatNotificationPushDeliveryService {
  async deliverMessageCreated(input: {
    tenantId: number
    tenantSlug: string
    accountId: number
    threadMapping: ChatwootConversationThreadMapping
    chatwootMessageId: number | null
  }): Promise<PushDeliverySummary>
}
```

Tests:

- [ ] Skips when VAPID unavailable.
- [ ] Skips when message id is null.
- [ ] Skips user with global `new_messages_enabled=false`.
- [ ] Skips user with thread override `new_messages_enabled=false`.
- [ ] Skips user with effective `push_enabled=false`.
- [ ] Sends when global push is true and thread override is null.
- [ ] Sends when global push is false and thread override is true only if global `new_messages_enabled=true`.
- [ ] Sends generic payload to active subscriptions.
- [ ] Does not duplicate delivery on repeated webhook delivery.
- [ ] Marks `410` subscription as expired.
- [ ] Records non-expiring transport failure.
- [ ] Never includes forbidden fields in payload.

Verification:

```bash
pnpm --dir backend test -- pushDeliveryService --run
```

Expected:

- Delivery tests pass with fake push transport.

Checkpoint:

- Inspect fake transport payload assertions before webhook integration.

---

## Task 7: Integrate Push Delivery Into Chatwoot Webhooks

**Goal:** Подключить push delivery к accepted Chatwoot `message_created`, не меняя realtime semantics.

Files:

- `backend/src/modules/chatwoot-webhooks/service.ts`
- `backend/src/modules/chatwoot-webhooks/repository.ts`
- `backend/src/modules/chatwoot-webhooks/service.test.ts`
- `backend/src/app.ts`

Steps:

- [ ] Extend webhook service dependencies:

```ts
pushDeliveryService?: {
  deliverMessageCreated(input: {
    tenantId: number;
    tenantSlug: string;
    accountId: number;
    threadMapping: ChatwootConversationThreadMapping;
    chatwootMessageId: number | null;
  }): Promise<PushDeliverySummary>;
};
```

- [ ] Ensure webhook repository mapping exposes enough thread data:
  - `portalChatThreadId`;
  - public `threadId`;
  - `threadType`;
  - private `portalUserId` when applicable;
  - target Chatwoot contact id for group, derived from stored thread row or existing thread mapping.

- [ ] Call push delivery only after:
  - signature passes;
  - tenant/account/inbox checks pass;
  - delivery is not ignored as duplicate;
  - conversation mapping is found;
  - realtime publish path has completed or attempted as it does today.

- [ ] Guard:
  - `event === "message_created"`;
  - `message_type` is client-visible by existing message mapping rules;
  - `chatwoot_message_id` non-null.

- [ ] Wrap push delivery so errors do not fail webhook response:

```ts
try {
  await pushDeliveryService.deliverMessageCreated({
    tenantId,
    tenantSlug,
    accountId,
    threadMapping,
    chatwootMessageId,
  })
} catch {
  // record internal failure in delivery service where possible; webhook stays accepted
}
```

- [ ] Do not call push delivery for `message_updated`.

Tests:

- [ ] `message_created` calls push delivery once.
- [ ] Duplicate webhook does not call push delivery again.
- [ ] `message_updated` does not call push delivery.
- [ ] Push delivery rejection does not make webhook route fail.
- [ ] Realtime publish behavior remains unchanged.

Verification:

```bash
pnpm --dir backend test -- chatwoot-webhooks --run
```

Expected:

- Existing webhook tests plus new push integration tests pass.

Checkpoint:

- This closes backend send path. Run all backend tests before frontend work:

```bash
pnpm --dir backend test -- --run
```

---

## Task 8: Frontend API Types And Client

**Goal:** Добавить typed frontend API для notification settings and push subscription lifecycle.

Files:

- `frontend/src/features/chat/types.ts`
- `frontend/src/features/chat/api/chatClient.ts`
- `frontend/src/features/chat/api/chatClient.notifications.test.ts`
- `frontend/src/features/chat/pages/ChatPage.test.tsx`

Steps:

- [ ] Add types:

```ts
export type UserNotificationSettings = {
  newMessagesEnabled: boolean
  soundEnabled: boolean
  pushEnabled: boolean
}

export type ChatNotificationSettings = {
  threadId: string
  global: UserNotificationSettings
  overrides: {
    newMessagesEnabled: boolean | null
    soundEnabled: boolean | null
    pushEnabled: boolean | null
  }
  effective: UserNotificationSettings
  browserPush: {
    supported: boolean
    configured: boolean
    permission: NotificationPermission | 'unsupported'
    subscribed: boolean
  }
}
```

```ts
export type PushPublicKeyResponse =
  | {
      available: true
      publicKey: string
      vapidKeyId: string
      publicKeyFingerprint: string
    }
  | { available: false }
```

- [ ] Extend internal `request` helper in `chatClient.ts` to support `PATCH` and `DELETE`.
- [ ] Add functions:

```ts
getUserNotificationSettings(): Promise<UserNotificationSettings>
updateUserNotificationSettings(
  patch: Partial<UserNotificationSettings>,
): Promise<UserNotificationSettings>
getChatNotificationSettings(threadId: string): Promise<ChatNotificationSettings>
updateChatNotificationSettings(
  threadId: string,
  patch: Partial<Pick<ChatNotificationSettings["overrides"], "newMessagesEnabled" | "soundEnabled" | "pushEnabled">>
): Promise<ChatNotificationSettings>
getPushPublicKey(): Promise<PushPublicKeyResponse>
savePushSubscription(subscription: PushSubscriptionJSON): Promise<void>
deletePushSubscription(endpoint: string): Promise<void>
```

- [ ] Keep all requests relative to portal origin.
- [ ] Ensure `threadId` is URL encoded in path.

Tests:

- [ ] API client loads global notification settings.
- [ ] API client PATCHes partial global settings.
- [ ] API client encodes group thread ids like `group:155`.
- [ ] PATCH sends partial body.
- [ ] PATCH sends `null` when resetting a thread override.
- [ ] DELETE sends endpoint body.
- [ ] Public key response handles `available=false`.

Verification:

```bash
pnpm --dir frontend test -- chatClient --run
```

Expected:

- API client tests pass.

---

## Task 9: Frontend Service Worker Push Runtime

**Goal:** Подготовить browser/PWA push registration, subscription and foreground suppression behavior.

Files:

- `frontend/public/sw.js`
- `frontend/src/pwa/serviceWorkerRuntime.ts`
- `frontend/src/pwa/serviceWorkerRuntime.test.ts`

Service worker behavior:

- [ ] Existing install/activate/cache behavior remains intact.
- [ ] Add `push` event:
  - parse JSON defensively;
  - default payload to `{ type: "chat_message", url: "/" }`;
  - find controlled same-origin focused clients;
  - if a focused client is registered as push-ready, `postMessage` payload and do not show system notification;
  - otherwise `showNotification("Новое сообщение", { body: "Откройте портал, чтобы посмотреть чат.", data: { url: "/" } })`.

- [ ] Add `message` event from page:
  - `PORTAL_PUSH_CLIENT_READY` stores `clientId` in an in-memory ready set;
  - `PORTAL_PUSH_CLIENT_NOT_READY` removes `clientId`.

- [ ] Add `notificationclick`:
  - close notification;
  - focus an existing same-origin window if one exists;
  - otherwise open `/`;
  - ignore external URLs.

Runtime behavior:

- [ ] Feature-detect:
  - `window.isSecureContext`;
  - `navigator.serviceWorker`;
  - `window.PushManager`;
  - `window.Notification`;
  - `registration.pushManager`.

- [ ] Register service worker as today, then wait for `navigator.serviceWorker.ready` before subscribing.
- [ ] Convert VAPID base64url public key to `Uint8Array`.
- [ ] Subscribe only from user gesture:

```ts
registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey,
})
```

- [ ] Add helper functions:

```ts
getBrowserPushSupportState(): BrowserPushSupportState
subscribeBrowserPush(publicKey: string): Promise<PushSubscriptionJSON>
getExistingBrowserPushSubscription(): Promise<PushSubscriptionJSON | null>
unsubscribeBrowserPush(endpoint?: string): Promise<string | null>
registerPortalPushMessageListener(handler): () => void
```

- [ ] On app runtime, register push-ready message listener only after React handler is attached.
- [ ] If listener is not active, SW must fall back to system notification.
- [ ] Do not prompt for notification permission automatically.

Tests:

- [ ] Unsupported browser returns `supported=false`.
- [ ] Insecure context returns `supported=false`.
- [ ] VAPID key conversion works for base64url key.
- [ ] Subscribe waits for service worker ready.
- [ ] Subscribe requests `userVisibleOnly: true`.
- [ ] Message listener posts ready/not-ready to controller.

Verification:

```bash
pnpm --dir frontend test -- serviceWorkerRuntime --run
```

Expected:

- Runtime tests pass.

Manual browser note:

- Native permission prompt cannot be fully automated reliably across browsers. Playwright e2e will cover visible UI state and mocked runtime paths; real permission prompt is a manual prod/staging smoke item.

---

## Task 10: Frontend Global And Chat Notifications Pages

**Goal:** Добавить `Настройки -> Уведомления` для global defaults и chat-adjacent `Уведомления` для thread overrides в текущем UI pattern.

Files:

- `frontend/src/features/settings/pages/SettingsPage.tsx`
- `frontend/src/features/settings/pages/UserNotificationsPage.tsx`
- `frontend/src/features/settings/pages/UserNotificationsPage.test.tsx`
- `frontend/src/features/settings/useUserNotificationsSettings.ts`
- `frontend/src/features/chat/pages/ChatNotificationsPage.tsx`
- `frontend/src/features/chat/pages/useChatNotificationsPanel.ts`
- `frontend/src/features/chat/pages/ChatAuxiliaryPages.tsx`
- `frontend/src/features/chat/pages/ChatPage.tsx`
- `frontend/src/app/AppRoutes.tsx`
- `frontend/src/app/layouts/AppShellLayout.tsx`
- `frontend/src/app/routePaths.ts`
- `frontend/src/features/chat/components/ChatHeader.tsx`
- `frontend/src/features/chat/components/ChatHeader.test.tsx`
- `frontend/src/features/chat/pages/ChatNotificationsPage.test.tsx`
- `frontend/src/features/chat/pages/ChatPage.notifications.test.tsx`

UI behavior:

- [ ] Top-level settings entry:
  - label: `Настройки`;
  - contains page entry `Уведомления`;
  - uses the same width/layout boundaries as login/chat auxiliary pages.

- [ ] Global notifications page:
  - title: `Уведомления`;
  - back button returns to previous settings/menu surface;
  - controls:
    - `Новые сообщения`;
    - `Звук`;
    - `Push-уведомления`;
    - `Отключить push на этом устройстве`.
  - `Новые сообщения=false` visually disables effective sound/push state globally.
  - `Push-уведомления` controls global default, not a browser subscription by itself.

- [ ] Header menu item:
  - label: `Уведомления`;
  - status line examples:
    - `Включены`;
    - `Звук включен · push выключен`;
    - `Отключены`;
    - `Push недоступен`;
  - opens full-screen panel.

- [ ] Full-screen page:
  - title: `Уведомления`;
  - back button returns to chat;
  - same max-width/layout rules as chat/info/media/search pages;
  - no duplicate menu actions from other features;
  - section for current chat name and type;
  - inheritance status:
    - `Используются общие настройки`;
    - `Есть настройки для этого чата`;
    - `Общие уведомления отключены`;
  - controls:
    - `Новые сообщения`;
    - `Звук`;
    - `Push-уведомления`;
    - `Отключить push на этом устройстве`.
  - action `Сбросить к общим настройкам` appears only when at least one thread override is not `null`.

- [ ] Thread `Новые сообщения=false`:
  - visually disables sound/push effective state;
  - does not erase stored child toggles;
  - copy is short and practical, not explanatory docs.

- [ ] `Push-уведомления`:
  - if browser unsupported: disabled with short status `Недоступно в этом браузере`;
  - if backend VAPID unavailable: disabled with status `Недоступно на сервере`;
  - if permission `denied`: disabled with status `Запрещено в настройках браузера`;
  - if permission `default`: user toggle click requests permission from that click only;
  - if permission `granted` on the global page: subscribe and save subscription, then enable global push default;
  - if permission `granted` on the chat page: subscribe and save subscription, then enable thread push override.

- [ ] `Отключить push на этом устройстве`:
  - visible only when existing browser subscription is present;
  - unsubscribes browser subscription;
  - calls backend DELETE;
  - does not change `pushEnabled` for the current chat.

Implementation shape:

```ts
export function useUserNotificationsSettings(args: { session: PortalSession }) {
  return {
    settings,
    browserPush,
    isLoading,
    error,
    updateSettings,
    enablePushDefault,
    disableDevicePush,
  }
}

export function useChatNotificationsPanel(args: {
  activeThread: ChatThread | null
  session: PortalSession
}) {
  return {
    isOpen,
    open,
    close,
    settings,
    isLoading,
    error,
    updateSettings,
    enablePushForThread,
    resetThreadOverrides,
    disableDevicePush,
  }
}
```

Tests:

- [ ] Top-level settings entry opens global notifications page.
- [ ] Global page loads settings.
- [ ] Global page toggles `Новые сообщения`, `Звук` and `Push-уведомления`.
- [ ] Menu opens notifications page.
- [ ] Page shows current chat name/type.
- [ ] Chat page shows inheritance status.
- [ ] Chat page GET settings load global, overrides and effective state.
- [ ] Chat toggle `Новые сообщения` PATCHes only `newMessagesEnabled` override.
- [ ] Chat toggle `Звук` PATCHes only `soundEnabled` override.
- [ ] Reset action PATCHes all three thread overrides to `null`.
- [ ] Push unsupported renders disabled state.
- [ ] Push permission denied renders disabled browser state.
- [ ] Push permission default prompts only after click.
- [ ] Device unsubscribe keeps thread `pushEnabled` unchanged.
- [ ] Back button returns to chat without losing active thread.

Verification:

```bash
pnpm --dir frontend test -- UserNotificationsPage --run
pnpm --dir frontend test -- ChatNotificationsPage --run
pnpm --dir frontend test -- ChatHeader --run
```

Expected:

- Global notification page, chat notification page and menu tests pass.

Checkpoint:

- After this task, run the frontend route manually once before sound integration.

---

## Task 11: Frontend In-Portal Sound

**Goal:** Проигрывать короткий звук только для новых входящих сообщений текущего активного чата, когда настройки это разрешают.

Files:

- `frontend/src/features/chat/pages/useChatNotificationSound.ts`
- `frontend/src/features/chat/pages/useChatNotificationSound.test.ts`
- `frontend/src/features/chat/pages/ChatPage.tsx`

Rules:

- [ ] Sound plays only when:
  - active thread is open;
  - effective `newMessagesEnabled=true`;
  - effective `soundEnabled=true`;
  - message is new compared to already seen ids;
  - message author is not current portal user;
  - browser tab/runtime can play sound.

- [ ] Sound does not play:
  - for initial history load;
  - for current user's own sent message;
  - for `message_updated`;
  - for history fragment hydration;
  - when master switch is off.

- [ ] Use local generated Web Audio tone:
  - no external audio URL;
  - short duration;
  - gracefully no-op if `AudioContext` is unavailable or blocked.

- [ ] Unlock audio after first user gesture:
  - `pointerdown`;
  - `keydown`;
  - cleanup listeners on unmount.

Implementation shape:

```ts
export function useChatNotificationSound(args: {
  activeThreadId: string | null
  messages: PortalMessage[]
  currentUserId: number | null
  enabled: boolean
}) {
  // tracks seen ids per thread and plays only for later incoming messages
}
```

Tests:

- [ ] No sound on initial message list.
- [ ] Sound on later incoming message.
- [ ] No sound on own message.
- [ ] No sound when settings disabled.
- [ ] No duplicate sound for the same message id.
- [ ] Switching thread resets baseline without playing old messages.

Verification:

```bash
pnpm --dir frontend test -- useChatNotificationSound --run
```

Expected:

- Sound hook tests pass.

---

## Task 12: End-To-End Flow Coverage

**Goal:** Покрыть browser/runtime сценарии, которые пользователь реально будет проверять.

Files:

- `tests/e2e/chat-notifications.spec.ts`
- `tests/e2e/support/runtimeEnv.ts`
- `tests/e2e/support/portalUsers.ts`
- `tests/e2e/support/chatwoot.ts`
- `docs/roadmap/work-log.md` only after implementation and review are closed

Playwright scenarios:

- [ ] User opens `Настройки -> Уведомления`.
- [ ] User toggles global `Новые сообщения` off and back on.
- [ ] User toggles global `Звук` off and back on.
- [ ] User opens chat menu and sees `Уведомления` status line.
- [ ] User opens notifications page from private chat.
- [ ] User opens notifications page from group chat.
- [ ] User toggles chat `Новые сообщения` off and back on.
- [ ] User toggles chat `Звук` off and back on.
- [ ] User resets chat overrides to global settings.
- [ ] Browser unsupported/mock state shows push unavailable without crashing.
- [ ] Browser permission denied/mock state shows browser-denied copy.
- [ ] Backend unavailable public key/mock state shows server-unavailable copy.
- [ ] Back navigation returns to the same chat.

Backend integration scenarios:

- [ ] Private webhook sends push to eligible user subscription.
- [ ] Group webhook sends push only to current verified group members.
- [ ] Current author's subscription does not receive push.
- [ ] Duplicate webhook delivery does not send duplicate push.
- [ ] `message_updated` does not send push.

Commands:

```bash
pnpm --dir backend test -- chat-notifications chatwoot-webhooks --run
pnpm --dir frontend test -- UserNotificationsPage ChatNotificationsPage useChatNotificationSound serviceWorkerRuntime --run
pnpm e2e -- chat-notifications
```

Expected:

- Targeted backend and frontend tests pass.
- Playwright notifications spec passes with mocked browser push capabilities.
- Any manual-only browser permission behavior is documented in final response, not hidden.

---

## Task 13: Code Review And Finding Closure

**Goal:** Закрыть implementation через project closure flow.

Review checklist:

- [ ] Multi-tenancy:
  - every DB query filters by `tenant_id`;
  - no cross-tenant endpoint/subscription mutation;
  - global settings are scoped to current tenant/user;
  - thread overrides cannot be read or written without thread authority;
  - group recipients are current Chatwoot-confirmed portal members.

- [ ] Security:
  - no Chatwoot IDs or message content in push payload;
  - browser never receives Chatwoot authority;
  - VAPID private key backend-only;
  - permission prompt only from user gesture.

- [ ] Reliability:
  - push failure does not break webhook realtime;
  - expired subscriptions are cleaned/marked;
  - duplicate webhook does not duplicate push;
  - service worker notification click never opens external URLs.

- [ ] UX:
  - global settings and chat overrides are visually distinct;
  - page respects existing full-screen auxiliary page layout;
  - controls are clear and not duplicated from menu;
  - reset-to-global state is understandable;
  - disabled states are understandable;
  - sound respects master switch.

- [ ] Tests:
  - backend invariants covered by unit/integration tests;
  - frontend state covered by unit tests;
  - runtime browser flow covered by Playwright where automatable.

If review finds bugs:

- [ ] Create one `docs/findings/F-NOTIFY-*.md` per active finding according to `docs/findings/README.md`.
- [ ] Fix findings before moving to next feature slice unless user explicitly defers.
- [ ] Delete finding files only after fix and verification.

Verification after fixes:

```bash
pnpm --dir backend test -- --run
pnpm --dir frontend test -- --run
pnpm e2e -- chat-notifications
pnpm format:check
git diff --check
```

Expected:

- Required targeted checks pass.
- Full format status is reported accurately. If old unrelated format debt remains, list it as existing blocker and keep current-scope files formatted.

---

## Task 14: Documentation, Checkpoint Commit, Prod Test Readiness

**Goal:** Зафиксировать stable baseline after implementation is complete.

Files:

- `docs/roadmap/work-log.md`
- commit message

Steps:

- [ ] Update `docs/roadmap/work-log.md` only after implementation, review, fixes, targeted checks and required tests are complete.
- [ ] Keep work-log short:
  - mention completed Notifications baseline;
  - do not list transient fixes, commands, test counts or smoke details;
  - keep only one final `Recommended Next Step` block.

- [ ] Check git status:

```bash
git status --short --branch
git diff --check
```

- [ ] Inspect staged changes before commit:

```bash
git diff --stat
git diff --cached --stat
```

- [ ] Make checkpoint commit only when closure flow is complete:

```bash
git add backend frontend tests docs package.json pnpm-lock.yaml
git commit -m "feat: add chat notifications"
```

- [ ] After commit, prepare prod smoke notes:
  - required backend env vars for VAPID;
  - browser/PWA limitations;
  - test global settings page;
  - test private chat;
  - test group chat;
  - test thread override and reset to global;
  - test foreground tab;
  - test background/system notification;
  - test device unsubscribe;
  - test master switch off.

Expected:

- Clean feature branch with one feature checkpoint commit after review closure.

---

## Execution Order

Implement in this order:

1. Task 1: env contract.
2. Task 2: DB schema/migration.
3. Task 3: global and thread settings API.
4. Task 4: subscription API.
5. Task 5: recipient resolver.
6. Task 6: push delivery service.
7. Task 7: webhook integration.
8. Task 8: frontend API client.
9. Task 9: service worker/runtime.
10. Task 10: global and chat notifications pages.
11. Task 11: in-portal sound.
12. Task 12: e2e.
13. Task 13: review/fixes.
14. Task 14: docs/commit/prod readiness.

Do not start frontend push UI before backend settings/subscription contracts are stable.

Do not connect push delivery to webhook before recipient resolver tests pass.

Do not claim feature complete before Playwright covers the visible notifications page and toggles.
