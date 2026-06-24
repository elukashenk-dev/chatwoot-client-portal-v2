# Telegram Bridge Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Yandex Cloud Function Telegram gateway with a small self-hosted, tenant-aware Telegram bridge service on our production server, preserving group-chat forwarding and replacing 1C/S3 private-user checks with Chatwoot contact-phone validation.

**Architecture:** The bridge is a separate backend entrypoint and Docker Compose service. Tenant admins configure it from the portal admin UI after creating a Telegram inbox in Chatwoot: they paste the Chatwoot inbox URL and Telegram bot token, and the portal backend creates the encrypted bridge config and configures Telegram webhook. Telegram sends updates to `<TELEGRAM_BRIDGE_PUBLIC_BASE_URL>/telegram-bridge/<bridge-key>/<path-secret>`, the public reverse proxy routes that path to the bridge, and the bridge resolves tenant/Chatwoot config from a portal-owned `telegram_bridge_configs` row rather than global `CHATWOOT_*` env. It validates Telegram's secret header, deduplicates `update_id` per bridge config in portal Postgres, checks/creates Chatwoot contact inbox links through tenant-scoped Chatwoot Account API, and forwards accepted Telegram payloads to Chatwoot's existing Telegram webhook. Chatwoot core stays external and unchanged.

**Tech Stack:** Node 24, TypeScript, Fastify 5, Drizzle/Postgres, Vitest, Docker Compose, Caddy, Telegram Bot API, Chatwoot Account API.

---

## Status

Approved for implementation after production PWA/VPN testing finished.

This plan is restored into `main` as the Telegram bridge source of truth.
Implementation must start from a clean `main` in a separate feature branch, and
each task must close through the repository closure flow before moving to the
next risky boundary.

---

## Source Context

Yandex Function code to reuse only as product logic reference:

- `telegram_bridge.py`: message filtering, author prefixing, group-as-private transform, contact request keyboard.
- `index.py`: current flow boundaries for private messages, group messages, forwarding, and Telegram replies.

Yandex Function code to remove from the new design:

- 1C lookup.
- S3 private contact storage.
- S3 pending text storage.
- S3 update marker storage.
- Yandex Cloud handler/runtime wrapper.

Chatwoot local source facts checked in `../chatwoot-ce-stable`:

- `app/services/telegram/incoming_message_service.rb` ignores non-private Telegram chats.
- `app/services/telegram/param_helpers.rb` derives `source_id` from `message.from.id` and `chat_id` from `message.chat.id`.
- `app/models/channel/telegram.rb` sends outbound Telegram replies to `conversation.additional_attributes['chat_id']`.
- `app/services/telegram/update_message_service.rb` uses `edited_message.chat.id`, so edited messages are out of scope for the first bridge version.
- `app/controllers/webhooks/telegram_controller.rb` returns `200` after enqueueing a background job, so bridge retries can only guarantee HTTP acceptance by Chatwoot, not final Chatwoot job processing.
- `app/controllers/api/v1/accounts/contact_inboxes_controller.rb` supports finding a `contact_inbox` by `inbox_id` and `source_id`.
- `app/controllers/api/v1/accounts/contacts/contact_inboxes_controller.rb` supports creating a contact inbox link for an existing contact.
- `app/services/contacts/filter_service.rb` supports exact `phone_number` filtering via `contacts/filter`.

---

## Scope

In scope:

- Second Telegram bot bridge only.
- Private Telegram user authorization by phone against existing Chatwoot contacts.
- Group/supergroup Telegram messages forwarded into Chatwoot by transforming the group into a private-looking Telegram payload.
- Outbound replies from Chatwoot to Telegram groups continue through Chatwoot's native Telegram channel, because the transformed conversation keeps the real group `chat_id`.
- Persistent `update_id` deduplication in portal Postgres.
- Production Docker Compose/Caddy wiring.
- Tenant admin UI for one-click bridge setup after Chatwoot Telegram inbox creation.
- Deployment and rollback runbook.
- Automated tests for parser, transform, phone checks, Chatwoot client behavior, dedupe behavior, route security, admin setup API, and admin setup UI.

Out of scope:

- No Chatwoot core patch.
- No 1C calls.
- No S3 state.
- No Yandex Function dependency.
- No changes to the first Telegram bot.
- No customer portal browser UI changes.
- No support for `edited_message` in the first bridge version.
- No backward-compatibility shims for the old function state.

---

## Multitenancy Model

Telegram webhooks arrive on a provider-owned bridge origin, not on each tenant's portal domain. That means the bridge cannot use normal browser `Host` tenant resolution. It must resolve tenant by a trusted bridge configuration row:

```text
/telegram-bridge/:bridgeKey/:webhookPathSecret
  -> telegram_bridge_configs.public_key
  -> decrypted/verified path secret
  -> tenant_id
  -> active portal_tenants row
  -> tenant Chatwoot base URL/account/runtime token
```

Rules:

- `bridgeKey` is a non-secret stable identifier, for example `provgroup-second-telegram`.
- `webhookPathSecret` and Telegram `secret_token` are secrets and are stored encrypted in portal DB.
- The request body is never allowed to choose tenant.
- `Host` is not tenant authority for this bridge because all Telegram bridge requests may use `app.lancora.ru`.
- Every Chatwoot Account API request uses the resolved tenant's `chatwoot_base_url`, `chatwoot_account_id` and decrypted runtime token.
- The Telegram inbox id is bridge-specific and must be checked against the resolved tenant's Chatwoot account during provisioning/reconciliation.
- One tenant can have more than one Telegram bridge config.
- Different tenants can use the same Chatwoot installation with different accounts; contact IDs, inbox IDs and source IDs are never treated as globally unique without tenant/bridge scope.
- Suspended, archived or provisioning tenants reject bridge traffic with a controlled retryable/disabled result and do not forward to Chatwoot.

Production MVP:

- Implement one bridge config for the current second bot.
- Keep the data model multi-tenant from day one so adding a second tenant/bot is configuration, not a schema rewrite.

---

## SMS Fallback Compatibility

The preserved SMS fallback plan at `docs/superpowers/plans/2026-05-26-sms-fallback-gateway-implementation.md` is deferred and not implemented, but it contains the same future need: normalize a phone number and find exact matching Chatwoot contacts inside one tenant's Chatwoot account.

Do not create a Telegram-only phone lookup helper that SMS will later duplicate. This plan must create the shared backend foundation first:

- `backend/src/lib/phone.ts`
  - generic E.164 normalization for Chatwoot comparison;
  - Russian `8xxxxxxxxxx` -> `+7xxxxxxxxxx`;
  - Russian `7xxxxxxxxxx` -> `+7xxxxxxxxxx`;
  - explicit international `+...` numbers are preserved when valid;
  - masking helpers for logs/tests that must not leak full phone numbers.
- `backend/src/integrations/chatwoot/contactLookup.ts`
  - keep existing `findChatwootContactById`;
  - add `findChatwootContactsByPhone`;
  - use tenant-scoped Chatwoot config passed by the caller;
  - use `POST /api/v1/accounts/:account_id/contacts/filter` with exact `phone_number` `equal_to`;
  - send this body shape:

```json
{
  "payload": [
    {
      "attribute_key": "phone_number",
      "filter_operator": "equal_to",
      "values": ["+79161234567"],
      "attribute_model": "standard",
      "custom_attribute_type": ""
    }
  ]
}
```

  - re-check returned candidates by normalized exact phone before returning them.

Telegram bridge uses the shared lookup to decide whether a Telegram private user can be linked. Future SMS fallback must reuse the same shared lookup and can add SMS-specific restrictions on top, for example accepting only Russian `+7` phones.

The old SMS fallback plan currently says `contacts/search?q=` in its deferred Task 6. That should be superseded when SMS is reopened: use the shared exact `contacts/filter` helper from this Telegram bridge scope instead.

---

## File Structure

Create backend bridge files:

- `backend/src/telegram-bridge/env.ts`: validates bridge-only environment variables.
- `backend/src/telegram-bridge/types.ts`: narrow Telegram update and Chatwoot client types used by the bridge.
- `backend/src/telegram-bridge/telegramPayload.ts`: filters Telegram updates and builds private/group payloads for Chatwoot.
- `backend/src/telegram-bridge/telegramClient.ts`: sends Telegram service messages and configures webhook via Telegram Bot API.
- `backend/src/telegram-bridge/chatwootBridgeClient.ts`: uses Chatwoot Account API and forwards accepted payloads to Chatwoot webhook.
- `backend/src/telegram-bridge/configRepository.ts`: loads active bridge config and resolved tenant runtime by `bridgeKey`.
- `backend/src/telegram-bridge/updateDedupeRepository.ts`: stores and checks `update_id` delivery state in portal Postgres.
- `backend/src/telegram-bridge/service.ts`: orchestrates one Telegram update.
- `backend/src/telegram-bridge/server.ts`: Fastify entrypoint for `/telegram-bridge/:bridgeKey/:webhookPathSecret` and health.
- `backend/src/telegram-bridge/createBridgeConfig.ts`: CLI script that creates/updates one tenant-owned bridge config.
- `backend/src/telegram-bridge/configureWebhook.ts`: CLI script that sets Telegram webhook with `secret_token` and `allowed_updates=["message"]` for one bridge config.
- `backend/src/telegram-bridge/getWebhookInfo.ts`: CLI script that reads Telegram webhook info for one bridge config without exposing the bot token.
- `backend/src/telegram-bridge/secrets.ts`: generates, reads, encrypts, decrypts and redacts bridge secrets without exposing them in process args or logs.

Create backend admin setup files:

- `backend/src/modules/telegram-bridge-admin/input.ts`: parses and validates tenant admin setup input, including Chatwoot inbox URL parsing.
- `backend/src/modules/telegram-bridge-admin/service.ts`: creates or updates one tenant-owned bridge config, verifies Chatwoot inbox ownership, configures Telegram webhook, and returns safe status.
- `backend/src/modules/telegram-bridge-admin/routes.ts`: protected tenant admin API routes under `/api/admin/integrations/telegram-bridge`.
- `backend/src/modules/telegram-bridge-admin/serviceFactory.ts`: wires tenant runtime, bridge repositories, Chatwoot client, Telegram client, audit logging, and secret encryption.
- `backend/src/modules/telegram-bridge-admin/publicTypes.ts`: safe response DTOs shared by route tests and frontend client.

Create shared backend files:

- `backend/src/lib/phone.ts`: shared Chatwoot/SMS/Telegram phone normalization and masking helpers.
- `backend/src/lib/phone.test.ts`: shared phone normalization tests.
- Modify `backend/src/integrations/chatwoot/contactLookup.ts`: add exact phone lookup helper.
- Modify `backend/src/integrations/chatwoot/contactLookup.test.ts`: add exact phone lookup tests.
- Modify `backend/src/integrations/chatwoot/inboxClient.ts` or `backend/src/integrations/chatwoot/client.ts` if needed: add a narrow helper for verifying a Telegram inbox by id.
- Modify the matching Chatwoot inbox tests when adding that helper.

Create backend bridge tests:

- `backend/src/telegram-bridge/telegramPayload.test.ts`
- `backend/src/telegram-bridge/chatwootBridgeClient.test.ts`
- `backend/src/telegram-bridge/configRepository.test.ts`
- `backend/src/telegram-bridge/updateDedupeRepository.test.ts`
- `backend/src/telegram-bridge/service.test.ts`
- `backend/src/telegram-bridge/server.test.ts`
- `backend/src/telegram-bridge/createBridgeConfig.test.ts`
- `backend/src/telegram-bridge/configureWebhook.test.ts`
- `backend/src/telegram-bridge/getWebhookInfo.test.ts`
- `backend/src/telegram-bridge/secrets.test.ts`

Create backend admin setup tests:

- `backend/src/modules/telegram-bridge-admin/input.test.ts`
- `backend/src/modules/telegram-bridge-admin/service.test.ts`
- `backend/src/modules/telegram-bridge-admin/routes.test.ts`

Create frontend admin setup files:

- `frontend/src/features/admin-telegram-bridge/api/adminTelegramBridgeClient.ts`: calls the protected admin bridge setup API and maps errors.
- `frontend/src/features/admin-telegram-bridge/api/adminTelegramBridgeClient.test.ts`
- `frontend/src/features/admin-telegram-bridge/components/AdminTelegramBridgeForm.tsx`: form for Chatwoot inbox URL and Telegram bot token.
- `frontend/src/features/admin-telegram-bridge/components/AdminTelegramBridgeForm.test.tsx`
- `frontend/src/features/admin-shell/pages/AdminTelegramBridgePage.tsx`: admin page shell for Telegram bridge setup and status.
- `frontend/src/features/admin-shell/pages/AdminTelegramBridgePage.test.tsx`

Modify shared backend/infra files:

- `backend/src/db/schema.ts`: export bridge config and delivery tables.
- `backend/src/db/telegramBridgeSchema.ts`: define bridge config and delivery tables separately and re-export them from `schema.ts`.
- `backend/package.json`: add scripts `telegram-bridge:dev`, `telegram-bridge:start`, `telegram-bridge:config:create`, `telegram-bridge:webhook:configure`, and `telegram-bridge:webhook:info`.
- `backend/src/app.ts` or the current backend route registration module: register `telegram-bridge-admin` routes with tenant admin session guard.
- `backend/Dockerfile`: keep the existing image and rely on Compose `command` override for the bridge service.
- `infra/production/compose.yaml`: add `telegram-bridge` service on the internal network.
- `infra/production/Caddyfile`: route `/telegram-bridge/*` to `telegram-bridge:3401`.
- `.env.example`: add local bridge env names with empty/example values.
- `.env.production.example`: add production bridge env names.
- `scripts/test-production-env-upgrade.sh`: validate required production env variables and Compose service wiring.
- `docs/operations/telegram-bridge.md`: add deploy, verification, webhook ownership, and rollback runbook.

Modify frontend admin route files:

- `frontend/src/app/routePaths.ts`: add `routePaths.admin.telegramBridge = '/admin/integrations/telegram-bridge'`.
- `frontend/src/app/AppRoutes.tsx`: lazy-load `AdminTelegramBridgePage` inside `AdminProtectedRoute`.
- `frontend/src/app/AppRoutes.admin.test.tsx`: cover authenticated route rendering and unknown route behavior.
- `frontend/src/features/admin-shell/pages/AdminBrandingPage.tsx` or shared admin shell/navigation components, if present in the current implementation: add a link to Telegram bridge settings without changing customer app navigation.

Generated by commands during implementation:

- `backend/drizzle/*.sql`: Drizzle migration for `telegram_bridge_configs` and `telegram_bridge_deliveries`.

---

## Environment Variables

Use bridge-specific process settings only. Do not put Chatwoot account IDs, Chatwoot tokens, Telegram bot tokens, Telegram webhook secrets or Telegram inbox IDs into global runtime env. Those values are tenant/bridge-owned data and belong in encrypted portal DB rows.

Required:

- `TELEGRAM_BRIDGE_PORT=3401`
- `TELEGRAM_BRIDGE_PUBLIC_BASE_URL=<public URL whose reverse proxy routes /telegram-bridge/* to the bridge service>`
- `DATABASE_URL=<portal-postgres-url>`
- `PORTAL_TENANT_SECRET_KEY=<existing-tenant-secret-key>`

Defaults:

- `TELEGRAM_BRIDGE_REQUEST_TIMEOUT_MS=10000`
- `TELEGRAM_BRIDGE_MAX_BODY_BYTES=1048576`
- `TELEGRAM_BRIDGE_PROCESSING_STALE_MS=600000`
- `TELEGRAM_BRIDGE_PHONE_PROMPT_TEXT=Пожалуйста, отправьте номер телефона кнопкой ниже, чтобы мы могли найти ваш контакт.`
- `TELEGRAM_BRIDGE_PHONE_NOT_FOUND_TEXT=Не удалось найти контакт с этим номером. Проверьте номер или напишите менеджеру.`
- `TELEGRAM_BRIDGE_PHONE_LINKED_TEXT=Спасибо, контакт найден. Теперь можете отправить сообщение.`

Tenant/bridge config stored in DB:

- `tenant_id`
- `public_key`
- `status`
- `display_name`
- `chatwoot_telegram_inbox_id`
- `telegram_bot_token_ciphertext`
- `telegram_webhook_path_secret_ciphertext`
- `telegram_secret_token_ciphertext`

Secrets must not be committed to `.env.example`, `.env.production.example`, docs, logs, or test fixtures. CLI output must mask bot tokens, path secrets, Telegram header secrets and full phone numbers.

CLI secret handling rules:

- Never accept secret values through ordinary argv flags.
- Telegram bot token must be read from `--telegram-bot-token-file=<path>` or `--telegram-bot-token-stdin`.
- `webhookPathSecret` and Telegram `secret_token` are generated cryptographically by default.
- Optional secret rotation may read replacement values only through `--webhook-path-secret-file=<path>` and `--telegram-secret-token-file=<path>`.
- CLI help, stdout, stderr and thrown errors must never print secret values.

---

## Runtime Flow

### Tenant admin setup flow

This is the primary product setup path. The CLI scripts remain as operator fallback and automation tools, not as the normal tenant-admin workflow.

1. Tenant admin creates a Telegram inbox in Chatwoot using Chatwoot's existing UI:
   - Chatwoot path example: `https://app.lancora.ru/app/accounts/1/settings/inboxes/17`;
   - Telegram bot token example shown here only as a fake value: `1234567890:AAExampleTokenValue`.
2. Tenant admin opens the portal admin page:
   - `/admin/integrations/telegram-bridge`
3. The page renders a protected admin form with two fields:
   - `Chatwoot inbox URL`;
   - `Telegram bot token`.
4. Tenant admin submits the form.
5. Portal frontend sends:

```json
{
  "chatwootInboxUrl": "https://app.lancora.ru/app/accounts/1/settings/inboxes/17",
  "telegramBotToken": "1234567890:AAExampleTokenValue"
}
```

to:

```text
POST /api/admin/integrations/telegram-bridge/setup
```

6. Backend validates the existing tenant admin session with `requireTenantAdminSession`.
7. Backend resolves the tenant from the current request context and never accepts tenant/account ids from the browser as authority.
8. Backend parses `account_id=1` and `inbox_id=17` from the Chatwoot inbox URL.
9. Backend rejects the request if the parsed account id does not match the resolved tenant's configured Chatwoot account id.
10. Backend calls Chatwoot Account API with the tenant runtime token and verifies:
    - inbox `17` exists;
    - inbox belongs to the resolved tenant Chatwoot account;
    - inbox channel type is Telegram;
    - inbox exposes the expected Telegram `bot_name` metadata;
    - inbox is not already bound to another active bridge config for this tenant.
11. Backend calls Telegram `getMe` with the submitted bot token and verifies:
    - Telegram returns a valid bot identity;
    - `getMe.result.username` matches the selected Chatwoot inbox `bot_name`;
    - the non-secret Telegram bot id is not already bound to another non-archived bridge config;
    - the token is not the first bot token recorded in existing bridge config or preflight safety checks.
12. Backend reads Telegram `getWebhookInfo` before any mutation and stores only safe metadata:
    - previous webhook host;
    - previous webhook route kind: `empty`, `chatwoot-native`, `telegram-bridge`, or `unknown`;
    - previous pending update count and last error summary if Telegram returns them.
13. Backend rejects setup when the existing webhook owner is `unknown`, unless an operator uses an explicit CLI fallback override documented in the operations runbook.
14. Backend verifies the public bridge health route:

```bash
curl -fsS "<TELEGRAM_BRIDGE_PUBLIC_BASE_URL>/telegram-bridge/health"
```

15. Backend creates or updates one `telegram_bridge_configs` row without breaking any existing active config:
    - `tenant_id` from the resolved request tenant;
    - generated stable `public_key`, unless an existing config for the same tenant/inbox is being updated;
    - `chatwoot_telegram_inbox_id = 17`;
    - non-secret Telegram bot id and username from `getMe`;
    - encrypted Telegram bot token;
    - generated encrypted webhook path secret and Telegram `secret_token` for a new config;
    - existing webhook path secret and Telegram `secret_token` for an existing active config update;
    - status `rotating` for new configs until Telegram confirms webhook ownership.
16. Backend calls Telegram `setWebhook` for the provided bot token:

```json
{
  "url": "<TELEGRAM_BRIDGE_PUBLIC_BASE_URL>/telegram-bridge/<generated-public-key>/<generated-path-secret>",
  "secret_token": "<generated-header-secret>",
  "allowed_updates": ["message"],
  "drop_pending_updates": false
}
```

17. Backend calls Telegram `getWebhookInfo` after `setWebhook` and verifies the returned URL equals the generated bridge URL.
18. Backend marks the config `active` only after `setWebhook` and post-write `getWebhookInfo` both succeed. If this is an update of an existing active config, the previous active config remains valid until that confirmation.
19. Backend returns a safe response without the bot token, path secret or header secret:

```json
{
  "bridge": {
    "publicKey": "provgroup-support-telegram",
    "status": "active",
    "chatwootTelegramInboxId": 17,
    "telegramBotUsername": "example_support_bot",
    "webhookUrlHost": "bridge.example.com",
    "webhookConfigured": true,
    "lastCheckedAt": "2026-06-24T12:00:00.000Z"
  }
}
```

20. Frontend shows a concise success state: `Telegram bridge работает`.

The frontend must never display, persist, log or keep the Telegram bot token after submission. It clears the token input after success and after any handled error.

### Webhook ownership and rotation

- Setup must read Telegram `getWebhookInfo` before every `setWebhook`.
- The previous webhook is classified as:
  - `empty`: no URL is configured;
  - `chatwoot-native`: URL points to Chatwoot's native `/webhooks/telegram/...`;
  - `telegram-bridge`: URL points to this bridge public base URL;
  - `unknown`: any other URL or an unparseable URL.
- Normal admin UI setup may proceed only from `empty`, `chatwoot-native`, or this bridge's own `telegram-bridge` owner.
- Normal admin UI setup must reject `unknown` owner before mutation, because that could overwrite another service's webhook.
- CLI fallback may expose an explicit operator override for `unknown` owner, but the runbook must require recording the previous safe webhook metadata first.
- Existing active config updates must not replace active path/header secrets before Telegram confirms the new webhook URL. Reuse the existing public key, path secret and Telegram header secret for same-inbox updates.
- If `setWebhook` fails, the previous active config remains valid and unchanged.
- If post-write `getWebhookInfo` does not report the expected bridge URL, the previous active config remains valid and unchanged.
- New configs may be stored as `rotating` during setup, but runtime must only resolve configs that are active or explicitly allowed by the rotation implementation. A new config becomes `active` only after `setWebhook` and post-write `getWebhookInfo` both succeed.

### Private chat

1. Telegram sends a `message` update.
2. Bridge validates:
   - `bridgeKey`;
   - request path secret against the active bridge config;
   - `X-Telegram-Bot-Api-Secret-Token`;
   - JSON content type;
   - body size;
   - `update_id`.
3. Bridge resolves the active bridge config and tenant runtime.
4. Bridge starts dedupe processing for `(telegram_bridge_config_id, update_id)`.
5. Bridge checks existing Chatwoot contact inbox link using the resolved tenant Chatwoot account:
   - `POST /api/v1/accounts/:account_id/contact_inboxes/filter`
   - body: `{ "inbox_id": bridgeConfig.chatwootTelegramInboxId, "source_id": "<telegram-from-id>" }`
6. If link exists, bridge forwards the original private Telegram payload to:
   - `POST /webhooks/telegram/:bot_token`
7. If link does not exist and the message is not a valid self contact card, bridge asks for phone through Telegram `sendMessage` with `request_contact: true`.
8. If link does not exist and a self contact card is present:
   - bridge rejects the contact card unless `message.contact.user_id === message.from.id`;
   - bridge normalizes the phone to Chatwoot E.164;
   - bridge finds a matching Chatwoot contact through the shared `findChatwootContactsByPhone` helper;
   - bridge requires exactly one matching Chatwoot contact in the resolved tenant account;
   - bridge creates a contact inbox link with `source_id = message.from.id`;
   - bridge sends a confirmation message in Telegram;
   - bridge does not forward the contact card to Chatwoot.

### Chatwoot contact link persistence

- The bridge must not store Telegram-user-to-Chatwoot-contact links in its own DB.
- The durable link lives in Chatwoot's `contact_inboxes` table, because Chatwoot is the source of truth for contacts, inboxes, conversations and messages.
- The bridge DB stores only bridge configuration and delivery/dedupe state.
- A normal Chatwoot upgrade that preserves the Chatwoot database keeps existing `contact_inboxes` links.
- If Chatwoot is fully reinstalled with an empty database, the links are expected to be gone together with contacts, conversations, messages and inbox settings.
- After a full Chatwoot rebuild, the bridge recreates a missing link only after the private Telegram user sends their own phone number and exactly one matching contact exists in the rebuilt Chatwoot tenant account.
- If the rebuilt Chatwoot account has no matching contact yet, the bridge must not create a new contact automatically; it returns the configured phone-not-found prompt until contacts are restored or imported into Chatwoot.

### Group or supergroup chat

1. Telegram sends a `message` update with `chat.type` equal to `group` or `supergroup`.
2. Bridge does not ask for phone.
3. Bridge resolves the active bridge config and tenant runtime from the request path before trusting Telegram payload data.
4. Bridge transforms the update so Chatwoot sees it as a private Telegram message:
   - `message.chat.type = "private"`
   - `message.chat.id` stays the original numeric Telegram group chat id so Chatwoot outbound replies still target the real group;
   - `message.chat.first_name = <group-title>`
   - `message.chat.title = <group-title>`
   - `message.from.id = "tg_group:<original-chat-id>"`
   - `message.from.first_name = <group-title>`
   - `message.text` or `message.caption` is prefixed with the real author name.
5. The transformed payload keeps enough original group data for audit in a bridge-owned field:
   - `message.chat.original_id`
   - `message.chat.original_type`
   - `message.from.original_author`
6. Bridge forwards the transformed payload to Chatwoot's Telegram webhook using the decrypted bot token from the resolved bridge config.
7. Chatwoot stores the real numeric group `chat_id` from `message.chat.id` in conversation `additional_attributes`, while `message.from.id = "tg_group:<id>"` becomes the private-looking source id. Replies from Chatwoot therefore continue going to the Telegram group.

### Unsupported updates

For the first bridge version, Telegram webhook must be configured with:

```json
{
  "allowed_updates": ["message"]
}
```

The bridge ignores unsupported update shapes with `200` and logs a compact reason. It does not process `edited_message` because Chatwoot's edit path would not match the transformed group `source_id`.

---

## Data Model

Create `telegram_bridge_configs` in portal Postgres:

- `id uuid primary key`
- `tenant_id integer not null references portal_tenants(id)`
- `public_key text not null`
- `display_name text not null`
- `status text not null`
- `chatwoot_telegram_inbox_id integer not null`
- `telegram_bot_id text not null`
- `telegram_bot_username text not null`
- `telegram_bot_token_ciphertext text not null`
- `telegram_webhook_path_secret_ciphertext text not null`
- `telegram_secret_token_ciphertext text not null`
- `last_webhook_owner text`
- `last_webhook_host text`
- `last_webhook_checked_at timestamp with time zone`
- `created_at timestamp with time zone not null default now()`
- `updated_at timestamp with time zone not null default now()`

Constraints:

- unique index on `public_key`
- unique index on `(tenant_id, chatwoot_telegram_inbox_id)`
- unique partial index on `telegram_bot_id` for non-archived configs
- `status` values are `active`, `disabled`, `rotating`, `archived`
- `last_webhook_owner` values are `empty`, `chatwoot-native`, `telegram-bridge`, `unknown`, or null before first check.

Do not store full Telegram webhook URLs if they include the bridge path secret. Store only safe classified metadata such as host and owner kind.

Create `telegram_bridge_deliveries` in portal Postgres:

- `id uuid primary key`
- `telegram_bridge_config_id uuid not null references telegram_bridge_configs(id)`
- `update_id bigint not null`
- `status text not null`
- `telegram_chat_id text`
- `telegram_from_id text`
- `error_code text`
- `error_message text` with sanitized bounded text, max `1000` chars
- `attempt_count integer not null default 1`
- `created_at timestamp with time zone not null default now()`
- `updated_at timestamp with time zone not null default now()`
- `processed_at timestamp with time zone`

Constraints:

- unique index on `(telegram_bridge_config_id, update_id)`
- `status` values are `processing`, `processed`, `failed`

Dedupe rules:

- New update inserts `processing`.
- Duplicate `processed` update returns `200` without forwarding again.
- Duplicate recent `processing` update does not forward again and does not return `200`; it returns retryable `503` unless a short re-read observes durable `processed`.
- Duplicate stale `processing` update after `TELEGRAM_BRIDGE_PROCESSING_STALE_MS` is reclaimed and processed again.
- `failed` update is retried on the next Telegram delivery by setting status back to `processing` and incrementing `attempt_count`.
- Successful processing marks `processed`.
- Failed forwarding/lookup marks `failed` and returns `500` so Telegram can retry.
- Never acknowledge a Telegram update as successful until a durable `processed` state exists.
- `error_message` stores only bounded sanitized text. Never persist raw exception messages that may contain bot tokens, webhook path secrets, Telegram header secrets, token-bearing URLs or full phone numbers.

---

## Task 0: Branch And Safety Setup

**Files:**

- Read: `AGENTS.md`
- Read: `docs/roadmap/work-log.md`
- Read: `docs/architecture/overview.md`
- Read: `docs/roadmap/implementation-plan.md`
- Read: `docs/architecture/decisions.md`

- [x] Confirm user approval to implement this plan.
- [x] Record current dirty files with `git status --short --branch`.
- [x] Do not stage or modify existing unrelated files:
  - `docs/operations/installed-pwa-smoke.md`
  - `docs/operations/production-mcp-playwright-test-cycle.md`
  - `docs/operations/production-chat-recovery-manual-test-cases.md`
  - `tmp/`
- [x] Switch to latest `main`.
- [x] Create implementation branch:

```bash
git checkout main
git pull --ff-only
git checkout -b feature/telegram-bridge-service
```

Expected result:

```text
Switched to a new branch 'feature/telegram-bridge-service'
```

---

## Task 1: Bridge Config And Delivery Tables

**Files:**

- Create: `backend/src/db/telegramBridgeSchema.ts`
- Modify: `backend/src/db/schema.ts`
- Create: `backend/src/telegram-bridge/configRepository.ts`
- Test: `backend/src/telegram-bridge/configRepository.test.ts`
- Create: `backend/src/telegram-bridge/updateDedupeRepository.ts`
- Test: `backend/src/telegram-bridge/updateDedupeRepository.test.ts`
- Generate: `backend/drizzle/*.sql`

- [x] Write config repository tests for:
  - active bridge config resolves by `public_key`;
  - wrong path secret is rejected;
  - disabled bridge config is rejected;
  - suspended tenant is rejected;
  - non-secret Telegram bot id and username are stored and returned;
  - non-archived configs cannot reuse the same Telegram bot id;
  - full webhook URLs containing path secrets are never persisted;
  - safe webhook owner metadata can be stored as host plus owner kind;
  - tenant Chatwoot runtime config is decrypted from `portal_tenants`;
  - bridge-specific Telegram secrets are decrypted from `telegram_bridge_configs`;
  - bridge config for tenant A cannot return tenant B Chatwoot config.
- [x] Write delivery repository tests for:
  - first update starts processing;
  - duplicate processed update is skipped;
  - duplicate recent processing update is retryable and does not forward again;
  - duplicate while original processing later fails remains retryable and is not acknowledged as processed;
  - stale processing update is reclaimed;
  - failed update is retried;
  - successful update is marked processed;
  - failed delivery row stores sanitized bounded error text without bot token, path secret, Telegram header secret or full phone number.
- [x] Implement `telegramBridgeConfigs` and `telegramBridgeDeliveries` Drizzle tables with the fields and constraints from the Data Model section.
- [x] Export `telegramBridgeConfigs` and `telegramBridgeDeliveries` from `backend/src/db/schema.ts`.
- [x] Implement `findActiveBridgeConfigByPublicKey`.
- [x] Implement decrypted tenant runtime resolution using `PORTAL_TENANT_SECRET_KEY` and existing tenant secret helpers.
- [x] Implement `startUpdateProcessing`, `markUpdateProcessed`, and `markUpdateFailed`.
- [x] Implement shared redaction before persisting any `error_message`.
- [x] Generate migration:

```bash
pnpm --dir backend db:generate
```

- [x] Run targeted test:

```bash
pnpm --dir backend exec vitest run src/telegram-bridge/configRepository.test.ts src/telegram-bridge/updateDedupeRepository.test.ts
```

Expected result:

```text
Test Files  2 passed
```

---

## Task 2: Environment Validation

**Files:**

- Create: `backend/src/telegram-bridge/env.ts`
- Test: `backend/src/telegram-bridge/env.test.ts`
- Modify: `.env.example`
- Modify: `.env.production.example`

- [ ] Write tests for valid config, missing required config, invalid URLs, invalid positive integers, and empty secret strings.
- [ ] Implement `loadTelegramBridgeEnv()` with Zod and local `.env` loading behavior consistent with `backend/src/config/env.ts`.
- [ ] Normalize base URLs by stripping trailing slash.
- [ ] Require bridge-specific env names from the Environment Variables section.
- [ ] Assert that removed single-tenant env names are not part of bridge config:
  - `TELEGRAM_BRIDGE_TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_BRIDGE_CHATWOOT_ACCOUNT_ID`
  - `TELEGRAM_BRIDGE_CHATWOOT_API_ACCESS_TOKEN`
  - `TELEGRAM_BRIDGE_CHATWOOT_TELEGRAM_INBOX_ID`
- [ ] Add bridge env entries to `.env.example` with safe local placeholder values.
- [ ] Add bridge env entries to `.env.production.example` with empty secret values and explanatory comments only where that file already uses comments.
- [ ] Run targeted test:

```bash
pnpm --dir backend exec vitest run src/telegram-bridge/env.test.ts
```

Expected result:

```text
Test Files  2 passed
```

---

## Task 3: Shared Phone Normalization And Chatwoot Phone Lookup

**Files:**

- Create: `backend/src/lib/phone.ts`
- Test: `backend/src/lib/phone.test.ts`
- Modify: `backend/src/integrations/chatwoot/contactLookup.ts`
- Modify: `backend/src/integrations/chatwoot/contactLookup.test.ts`

- [ ] Write tests for:
  - `89161234567` -> `+79161234567`;
  - `79161234567` -> `+79161234567`;
  - `+79161234567` -> `+79161234567`;
  - explicit non-Russian international numbers with `+`;
  - empty/invalid values;
  - phone masking does not expose the full number.
- [ ] Implement `normalizePhoneToE164(value: unknown): string | null`.
- [ ] Implement `normalizeRussianPhoneToE164(value: unknown): string | null` as a narrow wrapper for future SMS fallback.
- [ ] Implement `maskPhoneForLogs(value: unknown): string`.
- [ ] Add `findChatwootContactsByPhone` tests:
  - calls `POST /api/v1/accounts/:accountId/contacts/filter`;
  - body exactly uses `payload[0].attribute_key = "phone_number"`, `filter_operator = "equal_to"`, `values = [normalizedPhone]`, `attribute_model = "standard"` and `custom_attribute_type = ""`;
  - URL uses the tenant-scoped `accountId` supplied by the caller;
  - returned contacts are rechecked by normalized exact phone;
  - candidates without numeric id are dropped;
  - no exact normalized match returns `[]`;
  - Chatwoot 404 or empty payload returns `[]`;
  - invalid response shape throws `ChatwootClientRequestError`.
- [ ] Implement `findChatwootContactsByPhone` in `contactLookup.ts` using caller-provided tenant Chatwoot config.
- [ ] Do not add SMS fallback module files in this Telegram scope; the shared helper is the only SMS-facing preparation.
- [ ] Run targeted test:

```bash
pnpm --dir backend exec vitest run src/lib/phone.test.ts src/integrations/chatwoot/contactLookup.test.ts
```

Expected result:

```text
Test Files  1 passed
```

---

## Task 4: Telegram Payload Filtering And Transform

**Files:**

- Create: `backend/src/telegram-bridge/types.ts`
- Create: `backend/src/telegram-bridge/telegramPayload.ts`
- Test: `backend/src/telegram-bridge/telegramPayload.test.ts`

- [ ] Write tests for:
  - private text message passes unchanged;
  - private attachment before authorization is identified as needing phone prompt;
  - Telegram contact card is accepted only when `message.contact.user_id === message.from.id`;
  - foreign Telegram contact card is rejected before any phone lookup;
  - `/start` and bot commands are ignored according to the old function behavior;
  - group text is transformed into private-looking payload;
  - group transform keeps `message.chat.id` as the original numeric group id for outbound replies;
  - group transform sets `message.from.id` to `tg_group:<original-chat-id>` for Chatwoot private source identity;
  - group caption is prefixed with author name;
  - group attachment without text/caption gets a clear author placeholder text;
  - group contact identity is group title, not the first author;
  - `edited_message` is ignored.
- [ ] Implement `extractSupportedMessage(update)`.
- [ ] Implement `getTelegramChatType(message)`.
- [ ] Implement `buildAuthorName(message.from)`.
- [ ] Implement `buildGroupSourceId(chatId): string` returning `tg_group:<id>`.
- [ ] Implement `transformGroupUpdate(update)` using the Runtime Flow section.
- [ ] Implement `shouldIgnoreMessage(message)`.
- [ ] Implement `isSelfTelegramContact(message)` in `telegramPayload.ts`, using the shared phone helper only for phone normalization and keeping Telegram-specific contact-card validation inside the Telegram module.
- [ ] Run targeted test:

```bash
pnpm --dir backend exec vitest run src/telegram-bridge/telegramPayload.test.ts
```

Expected result:

```text
Test Files  1 passed
```

---

## Task 5: Chatwoot Bridge Client

**Files:**

- Create: `backend/src/telegram-bridge/chatwootBridgeClient.ts`
- Test: `backend/src/telegram-bridge/chatwootBridgeClient.test.ts`

- [ ] Write tests for:
  - `contact_inboxes/filter` 404 is treated as missing link;
  - `contact_inboxes/filter` 200 returns existing link;
  - bridge client delegates phone lookup to shared `findChatwootContactsByPhone`;
  - phone link accepts exactly one matching Chatwoot contact;
  - phone link rejects zero matching Chatwoot contacts;
  - phone link rejects multiple matching Chatwoot contacts as ambiguous;
  - `contacts/:contact_id/contact_inboxes` creates a link with the Telegram inbox id and source id;
  - stale/mismatched contact inbox is not accepted when inbox id or source id differs;
  - Chatwoot webhook forward sends the exact original/transformed Telegram payload;
  - token-bearing Chatwoot webhook URL is masked in errors/log metadata.
- [ ] Implement `findContactInboxBySourceId(sourceId)`.
- [ ] Implement `findSingleContactByPhone(phone)` using the shared lookup from Task 3.
- [ ] Implement `createContactInbox(contactId, sourceId)`.
- [ ] Implement `forwardTelegramUpdateToChatwoot(payload)`.
- [ ] Use the resolved tenant `chatwoot.baseUrl`, `chatwoot.accountId`, decrypted tenant runtime token and bridge-specific `chatwootTelegramInboxId`; never read Chatwoot config from bridge process env.
- [ ] Use `api_access_token` header only for Account API calls, not for the Chatwoot Telegram webhook.
- [ ] Run targeted test:

```bash
pnpm --dir backend exec vitest run src/telegram-bridge/chatwootBridgeClient.test.ts
```

Expected result:

```text
Test Files  1 passed
```

---

## Task 6: Telegram Client And Operator Fallback Scripts

**Files:**

- Create: `backend/src/telegram-bridge/telegramClient.ts`
- Create: `backend/src/telegram-bridge/createBridgeConfig.ts`
- Create: `backend/src/telegram-bridge/configureWebhook.ts`
- Create: `backend/src/telegram-bridge/getWebhookInfo.ts`
- Create: `backend/src/telegram-bridge/secrets.ts`
- Test: `backend/src/telegram-bridge/createBridgeConfig.test.ts`
- Test: `backend/src/telegram-bridge/configureWebhook.test.ts`
- Test: `backend/src/telegram-bridge/getWebhookInfo.test.ts`
- Test: `backend/src/telegram-bridge/secrets.test.ts`
- Modify: `backend/package.json`

- [ ] Write tests for:
  - phone prompt message body includes `request_contact: true`;
  - linked/denied messages use configured text;
  - bridge config creation stores bot token, path secret and Telegram header secret encrypted;
  - bridge config creation requires tenant slug and Chatwoot Telegram inbox id;
  - bridge config creation rejects inactive tenant;
  - bridge config creation verifies the Telegram inbox belongs to the resolved tenant Chatwoot account;
  - bridge config creation rejects non-Telegram or missing inboxes;
  - bridge config creation calls Telegram `getMe` and rejects a bot token whose username does not match the Chatwoot Telegram inbox `bot_name`;
  - bridge config creation rejects a bot id already bound to another non-archived bridge config;
  - bridge config creation reads bot token only from stdin or a file path;
  - bridge config creation generates path/header secrets when secret files are not supplied;
  - CLI help/output/error examples do not contain secret values;
  - `configureTelegramWebhook` calls `getWebhookInfo` before `setWebhook`;
  - `configureTelegramWebhook` rejects an `unknown` current webhook owner unless an explicit operator override flag is present;
  - `setWebhook` uses `secret_token`;
  - `setWebhook` uses `allowed_updates: ["message"]`;
  - `drop_pending_updates` defaults to `false`.
  - `getWebhookInfo` masks the bot token and returns Telegram webhook status for one bridge key.
  - pre-configuration `getWebhookInfo` can read a bot token from stdin or file without storing it and without exposing it in argv.
- [ ] Implement `sendPhonePrompt(chatId)`.
- [ ] Implement `sendPhoneLinked(chatId)`.
- [ ] Implement `sendPhoneNotFound(chatId)`.
- [ ] Implement `getTelegramBotIdentity(botToken)` using Telegram `getMe`, returning non-secret `id` and `username`.
- [ ] Implement `classifyTelegramWebhookOwner(webhookInfo)` returning `empty`, `chatwoot-native`, `telegram-bridge`, or `unknown`.
- [ ] Implement `createBridgeConfig` CLI with required arguments:

```text
--tenant=<tenant-slug>
--bridge-key=<public-key>
--display-name=<label>
--chatwoot-telegram-inbox-id=<id>
--telegram-bot-token-file=<path>
```

- [ ] Also support `--telegram-bot-token-stdin` for automation that pipes the bot token without putting it in argv.
- [ ] Generate `webhookPathSecret` and Telegram `secret_token` by default.
- [ ] For explicit secret rotation, support only `--webhook-path-secret-file=<path>` and `--telegram-secret-token-file=<path>`.
- [ ] During config creation, call Chatwoot Account API with the tenant runtime token and verify the requested inbox id belongs to the tenant account and is a Telegram channel inbox.
- [ ] During config creation, compare Telegram `getMe.result.username` with the Chatwoot inbox `bot_name` returned by Chatwoot. Reject mismatch before storing or configuring webhook.
- [ ] During config creation, store Telegram bot id and username as non-secret metadata.
- [ ] During config creation, reject a Telegram bot id already used by another non-archived bridge config, including configs owned by another tenant.
- [ ] Implement `configureTelegramWebhook()` using:

```json
{
  "url": "<TELEGRAM_BRIDGE_PUBLIC_BASE_URL>/telegram-bridge/<bridge-key>/<path-secret>",
  "secret_token": "<header-secret>",
  "allowed_updates": ["message"],
  "drop_pending_updates": false
}
```
- [ ] Implement `getWebhookInfo()` using the decrypted bot token from one bridge config and log only masked/safe fields.
- [ ] Make `configureTelegramWebhook()` run `getWebhookInfo()` before `setWebhook`, store only safe current owner metadata, and reject `unknown` owner unless an explicit operator override is passed.
- [ ] Make `configureTelegramWebhook()` run `getWebhookInfo()` after `setWebhook` and confirm the returned URL matches the expected bridge URL.
- [ ] Add pre-configuration webhook info support for cutover checks:
  - `--telegram-bot-token-file=<path>`;
  - `--telegram-bot-token-stdin`;
  - no config row is created;
  - stdout masks the token-bearing URL.

- [ ] Add package scripts:

```json
{
  "telegram-bridge:dev": "tsx watch src/telegram-bridge/server.ts",
  "telegram-bridge:start": "node dist/telegram-bridge/server.js",
  "telegram-bridge:config:create": "tsx src/telegram-bridge/createBridgeConfig.ts",
  "telegram-bridge:webhook:configure": "tsx src/telegram-bridge/configureWebhook.ts",
  "telegram-bridge:webhook:info": "tsx src/telegram-bridge/getWebhookInfo.ts"
}
```

- [ ] Run targeted tests:

```bash
pnpm --dir backend exec vitest run src/telegram-bridge/secrets.test.ts src/telegram-bridge/createBridgeConfig.test.ts src/telegram-bridge/configureWebhook.test.ts src/telegram-bridge/getWebhookInfo.test.ts
```

Expected result:

```text
Test Files  4 passed
```

---

## Task 6A: Tenant Admin Bridge Setup API

**Files:**

- Create: `backend/src/modules/telegram-bridge-admin/input.ts`
- Create: `backend/src/modules/telegram-bridge-admin/service.ts`
- Create: `backend/src/modules/telegram-bridge-admin/routes.ts`
- Create: `backend/src/modules/telegram-bridge-admin/serviceFactory.ts`
- Create: `backend/src/modules/telegram-bridge-admin/publicTypes.ts`
- Test: `backend/src/modules/telegram-bridge-admin/input.test.ts`
- Test: `backend/src/modules/telegram-bridge-admin/service.test.ts`
- Test: `backend/src/modules/telegram-bridge-admin/routes.test.ts`
- Modify: `backend/src/app.ts` or the current backend route registration module

This is the primary product setup path. The Task 6 CLI remains as operator fallback and automation, not as the normal tenant admin workflow.

- [ ] Write `input.test.ts` for:
  - accepts `https://app.lancora.ru/app/accounts/1/settings/inboxes/17` and returns `{ accountId: 1, inboxId: 17 }`;
  - rejects non-HTTPS inbox URLs;
  - rejects URLs without `/app/accounts/:accountId/settings/inboxes/:inboxId`;
  - rejects missing or empty Telegram bot token;
  - trims user input without logging secrets.
- [ ] Implement `parseChatwootInboxUrl(input: string): { accountId: number; inboxId: number }`.
- [ ] Implement `parseTelegramBridgeSetupInput(body)` returning:

```ts
type TelegramBridgeSetupInput = {
  chatwootAccountIdFromUrl: number
  chatwootTelegramInboxId: number
  telegramBotToken: string
}
```

- [ ] Write `service.test.ts` for:
  - setup rejects when parsed account id does not match resolved tenant Chatwoot account id;
  - setup verifies inbox id against tenant Chatwoot Account API;
  - setup rejects missing inbox;
  - setup rejects non-Telegram inbox;
  - setup rejects a Telegram inbox response without `bot_name`;
  - setup calls Telegram `getMe` before storing the submitted token;
  - setup rejects a submitted bot token whose `getMe.result.username` does not match the selected Chatwoot inbox `bot_name`;
  - setup rejects a submitted bot token whose `getMe.result.id` is already bound to another non-archived bridge config;
  - setup rejects an inbox already bound to another active bridge config;
  - setup creates encrypted bridge config for a new Telegram inbox;
  - setup updates the existing same-tenant same-inbox config instead of creating a duplicate;
  - setup calls `getWebhookInfo` before `setWebhook`;
  - setup stores only safe previous webhook metadata before mutation;
  - setup rejects an unknown existing webhook owner before mutation;
  - setup verifies `/telegram-bridge/health` before calling `setWebhook`;
  - setup calls `setWebhook` with generated bridge URL, `secret_token`, `allowed_updates: ["message"]` and `drop_pending_updates: false`;
  - setup calls `getWebhookInfo` after `setWebhook` and confirms the webhook URL matches the bridge URL;
  - setup leaves an existing active bridge config unchanged when `setWebhook` fails;
  - setup leaves an existing active bridge config unchanged when post-write `getWebhookInfo` does not match;
  - setup returns safe status without bot token, path secret or header secret;
  - setup masks bot token in thrown errors and audit metadata.
- [ ] Implement `createTenantTelegramBridgeSetupService`.
- [ ] Use the same lower-level config repository and Telegram client primitives as the CLI scripts. Do not duplicate encryption, redaction or webhook code.
- [ ] Add tenant admin audit events:
  - `telegram_bridge_setup_started`;
  - `telegram_bridge_setup_succeeded`;
  - `telegram_bridge_setup_failed`.
- [ ] Write `routes.test.ts` for:
  - unauthenticated admin request returns `401`;
  - customer session cannot access the route;
  - wrong tenant origin is rejected for POST;
  - successful POST returns safe bridge status;
  - invalid input returns a controlled `400` with no secret echo.
- [ ] Implement route:

```text
POST /api/admin/integrations/telegram-bridge/setup
```

- [ ] Optionally implement a safe status route for page reloads:

```text
GET /api/admin/integrations/telegram-bridge
```

The `GET` route returns only public keys, display names, inbox ids, statuses and last check timestamps. It never returns Telegram tokens, path secrets or header secrets.

- [ ] Register routes in the backend app using the existing tenant admin session guard pattern.
- [ ] Run targeted tests:

```bash
pnpm --dir backend exec vitest run src/modules/telegram-bridge-admin/input.test.ts src/modules/telegram-bridge-admin/service.test.ts src/modules/telegram-bridge-admin/routes.test.ts
```

Expected result:

```text
Test Files  3 passed
```

---

## Task 6B: Tenant Admin Bridge Setup UI

**Files:**

- Create: `frontend/src/features/admin-telegram-bridge/api/adminTelegramBridgeClient.ts`
- Test: `frontend/src/features/admin-telegram-bridge/api/adminTelegramBridgeClient.test.ts`
- Create: `frontend/src/features/admin-telegram-bridge/components/AdminTelegramBridgeForm.tsx`
- Test: `frontend/src/features/admin-telegram-bridge/components/AdminTelegramBridgeForm.test.tsx`
- Create: `frontend/src/features/admin-shell/pages/AdminTelegramBridgePage.tsx`
- Test: `frontend/src/features/admin-shell/pages/AdminTelegramBridgePage.test.tsx`
- Modify: `frontend/src/app/routePaths.ts`
- Modify: `frontend/src/app/AppRoutes.tsx`
- Modify: `frontend/src/app/AppRoutes.admin.test.tsx`
- Modify: existing admin shell/navigation component if one exists; otherwise keep navigation local to the new page and do not refactor admin branding layout.

- [ ] Write `adminTelegramBridgeClient.test.ts` for:
  - `setupTelegramBridge` posts to `/api/admin/integrations/telegram-bridge/setup`;
  - request body contains only `chatwootInboxUrl` and `telegramBotToken`;
  - success response is parsed into safe bridge status;
  - `400`, `401`, `403`, `409` and `502` map to short Russian UI messages;
  - errors do not include the submitted bot token.
- [ ] Implement `setupTelegramBridge`.
- [ ] If the backend `GET` status route is implemented in Task 6A, add `getTelegramBridgeStatus`.
- [ ] Write `AdminTelegramBridgeForm.test.tsx` for:
  - renders `Chatwoot inbox URL` and `Telegram bot token` fields;
  - disables submit while either field is empty;
  - submits both fields to the client;
  - clears the token field after success;
  - clears the token field after handled API error;
  - renders success status `Telegram bridge работает`;
  - renders validation/API error text without echoing the token.
- [ ] Implement `AdminTelegramBridgeForm`.
- [ ] Write `AdminTelegramBridgePage.test.tsx` for:
  - renders page heading `Telegram bridge`;
  - includes a concise setup form;
  - does not expose any token value after submit;
  - uses the same admin page visual language as `AdminBrandingPage`.
- [ ] Implement `AdminTelegramBridgePage`.
- [ ] Update `routePaths.admin`:

```ts
telegramBridge: '/admin/integrations/telegram-bridge'
```

- [ ] Update `AppRoutes.tsx` to lazy-load `AdminTelegramBridgePage` inside `AdminProtectedRoute`.
- [ ] Update `AppRoutes.admin.test.tsx`:
  - authenticated admin can open `/admin/integrations/telegram-bridge`;
  - unauthenticated admin is redirected to `/admin/login`;
  - customer auth endpoints are not called for the admin bridge route.
- [ ] Run targeted frontend tests:

```bash
pnpm --dir frontend exec vitest run src/features/admin-telegram-bridge/api/adminTelegramBridgeClient.test.ts src/features/admin-telegram-bridge/components/AdminTelegramBridgeForm.test.tsx src/features/admin-shell/pages/AdminTelegramBridgePage.test.tsx src/app/AppRoutes.admin.test.tsx
```

Expected result:

```text
Test Files  4 passed
```

---

## Task 7: Bridge Service Orchestration

**Files:**

- Create: `backend/src/telegram-bridge/service.ts`
- Test: `backend/src/telegram-bridge/service.test.ts`

- [ ] Write tests for:
  - duplicate processed update returns accepted duplicate without forwarding;
  - duplicate recent processing update returns retryable `503` without forwarding;
  - unknown bridge key returns ignored/unauthorized without Chatwoot calls;
  - wrong path secret returns ignored/unauthorized without Chatwoot calls;
  - disabled bridge config returns ignored/disabled without Chatwoot calls;
  - tenant A bridge config uses only tenant A Chatwoot account/base URL/token;
  - tenant B contact with the same phone is not used by tenant A bridge;
  - unknown private text asks for phone and does not forward;
  - unknown private attachment asks for phone and does not forward;
  - foreign contact card is rejected and does not create a Chatwoot link;
  - self contact card with unmatched phone sends not-found text;
  - self contact card with ambiguous same-tenant phone sends not-found/ambiguous text and does not create a link;
  - self contact card with matched phone creates Chatwoot contact inbox and sends linked text;
  - existing private contact inbox forwards original payload;
  - group message forwards transformed payload without phone prompt;
  - Chatwoot forward failure marks update failed and returns retryable failure;
  - Chatwoot Account API failure marks update failed and returns retryable failure.
- [ ] Implement `handleTelegramUpdate(update)` with dependencies injected for testability.
- [ ] Accept `bridgeKey` and `webhookPathSecret` as explicit service inputs from the server route.
- [ ] Resolve bridge config before dedupe and before reading trusted tenant runtime.
- [ ] Return a typed result:

```ts
type BridgeResult =
  | { kind: 'accepted' }
  | { kind: 'duplicate' }
  | { kind: 'ignored'; reason: string }
  | { kind: 'retryable_failure'; statusCode: 500 | 503; reason: string }
```

- [ ] Keep service logs compact and mask phone/token data.
- [ ] Run targeted test:

```bash
pnpm --dir backend exec vitest run src/telegram-bridge/service.test.ts
```

Expected result:

```text
Test Files  1 passed
```

---

## Task 8: Fastify Server Security

**Files:**

- Create: `backend/src/telegram-bridge/server.ts`
- Test: `backend/src/telegram-bridge/server.test.ts`

- [ ] Write tests for:
  - `GET /telegram-bridge/health` returns `200`;
  - route requires both `bridgeKey` and `webhookPathSecret`;
  - wrong path secret returns generic `404`;
  - missing Telegram secret header returns generic `403`;
  - wrong Telegram secret header returns generic `403`;
  - non-JSON POST returns `415`;
  - oversized body returns `413`;
  - valid POST calls `handleTelegramUpdate`;
  - ignored update returns `200`;
  - retryable failure returns `500`.
  - duplicate in-flight processing returns `503`.
- [ ] Implement Fastify app with body limit from `TELEGRAM_BRIDGE_MAX_BODY_BYTES`.
- [ ] Register exact POST route `/telegram-bridge/:bridgeKey/:webhookPathSecret`.
- [ ] Validate `X-Telegram-Bot-Api-Secret-Token` before processing body-dependent logic.
- [ ] Pass `bridgeKey` and `webhookPathSecret` to `handleTelegramUpdate`.
- [ ] Start on `0.0.0.0:${TELEGRAM_BRIDGE_PORT}`.
- [ ] Run targeted test:

```bash
pnpm --dir backend exec vitest run src/telegram-bridge/server.test.ts
```

Expected result:

```text
Test Files  1 passed
```

---

## Task 9: Production Compose And Caddy Wiring

**Files:**

- Modify: `infra/production/compose.yaml`
- Modify: `infra/production/Caddyfile`
- Modify: `scripts/test-production-env-upgrade.sh`

- [ ] Add `telegram-bridge` service using the existing `backend/Dockerfile` image build.
- [ ] Set service command:

```yaml
command: ["node", "backend/dist/telegram-bridge/server.js"]
```

- [ ] Add environment variables listed in the Environment Variables section.
- [ ] Do not add bot token, Chatwoot account id, Chatwoot API token or Telegram inbox id to Compose env.
- [ ] Depend on `portal-db` health.
- [ ] Expose internal port `3401`.
- [ ] Confirm which public host owns `TELEGRAM_BRIDGE_PUBLIC_BASE_URL`.
- [ ] If that host is served by `infra/production/Caddyfile`, add Caddy route before the catch-all handler:

```caddy
handle /telegram-bridge/* {
	reverse_proxy telegram-bridge:3401
}
```

- [ ] If that host is `app.lancora.ru` or another Chatwoot/reverse-proxy host outside this repo's Caddyfile, document the exact external host-proxy change in `docs/operations/telegram-bridge.md` and do not claim `infra/production/Caddyfile` alone exposes the bridge publicly.
- [ ] Verify public route before any Telegram `setWebhook` call:

```bash
curl -fsS "<TELEGRAM_BRIDGE_PUBLIC_BASE_URL>/telegram-bridge/health"
```

Expected result:

```text
command exits 0
```

- [ ] Update `scripts/test-production-env-upgrade.sh` so production env validation fails when bridge-required vars are missing.
- [ ] Run Compose config check:

```bash
docker compose --env-file .env.production -f infra/production/compose.yaml config >/tmp/chatwoot-client-portal-v2-compose-check.yaml
```

Expected result:

```text
command exits 0
```

If Docker is not running, stop and ask the user to start Docker before continuing the runtime check.

---

## Task 10: Operations Runbook

**Files:**

- Create: `docs/operations/telegram-bridge.md`

- [ ] Document env variables and which values are secrets.
- [ ] Document the normal tenant admin setup flow:
  1. create Telegram inbox in Chatwoot;
  2. copy the Chatwoot inbox URL, for example `https://app.lancora.ru/app/accounts/1/settings/inboxes/17`;
  3. open `/admin/integrations/telegram-bridge`;
  4. paste the Chatwoot inbox URL and Telegram bot token;
  5. click `Создать Telegram bridge`;
  6. verify the page shows `Telegram bridge работает`;
  7. send a Telegram private and group smoke message.
- [ ] Document that the portal admin UI is the primary supported setup path.
- [ ] Document the CLI as operator fallback for emergency repair or automation, not as the default tenant admin workflow.
- [ ] Document how to create/update one tenant-owned bridge config through CLI fallback:

```bash
pnpm --dir backend telegram-bridge:config:create \
  --tenant=<tenant-slug> \
  --bridge-key=<public-key> \
  --display-name=<label> \
  --chatwoot-telegram-inbox-id=<id> \
  --telegram-bot-token-file=/secure/path/to/bot-token
```

- [ ] Document stdin alternative without putting secret values in shell history:

```bash
pnpm --dir backend telegram-bridge:config:create \
  --tenant=<tenant-slug> \
  --bridge-key=<public-key> \
  --display-name=<label> \
  --chatwoot-telegram-inbox-id=<id> \
  --telegram-bot-token-stdin
```

- [ ] Document how to configure the test bot webhook:

```bash
pnpm --dir backend telegram-bridge:webhook:configure --bridge-key=<public-key>
```

- [ ] Document how to verify current Telegram webhook:

```bash
pnpm --dir backend telegram-bridge:webhook:info --bridge-key=<public-key>
```

- [ ] Document how to verify current Telegram webhook before a bridge config exists:

```bash
pnpm --dir backend telegram-bridge:webhook:info --telegram-bot-token-file=/secure/path/to/bot-token
```

- [ ] Document webhook ownership drift:
  - Chatwoot Telegram channel save can call `setWebhook` to Chatwoot's own `/webhooks/telegram/:token`.
  - After editing the second Telegram inbox in Chatwoot, re-open `/admin/integrations/telegram-bridge` and run setup again, or use CLI fallback.
  - Always verify the first bot webhook remains untouched.
- [ ] Document webhook owner preflight:
  - admin UI setup records current safe webhook metadata before mutation;
  - `empty`, `chatwoot-native`, and this `telegram-bridge` owner are allowed;
  - `unknown` owner is rejected in admin UI;
  - unknown-owner override is allowed only through documented CLI fallback after recording previous webhook info.
- [ ] For external hosts outside this repo's `infra/production/Caddyfile`, document:
  - exact proxy config path;
  - reload command;
  - rollback command;
  - expected `/telegram-bridge/health` response before `setWebhook`.
- [ ] Document smoke cases:
  - test private unknown user gets phone prompt;
  - test foreign contact card is rejected;
  - test known phone links contact;
  - test duplicate phone inside the same tenant is rejected as ambiguous;
  - test same phone in another tenant does not link the current bridge user;
  - test known linked private user forwards message to Chatwoot;
  - test group message appears in Chatwoot with author prefix;
  - test Chatwoot reply reaches Telegram group;
  - test duplicate update is not forwarded twice.
- [ ] Document rollback:
  - record previous webhook info before cutover;
  - restore previous webhook URL with Telegram `setWebhook`;
  - stop `telegram-bridge` service;
  - verify Chatwoot private direct path or previous function path according to the recorded URL.

---

## Task 11: Required Verification

**Files:**

- All files changed by Tasks 1-10.

- [ ] Run bridge targeted tests:

```bash
pnpm --dir backend exec vitest run src/lib/phone.test.ts src/integrations/chatwoot/contactLookup.test.ts src/telegram-bridge src/modules/telegram-bridge-admin
```

Expected result:

```text
Test Files  all passed
```

- [ ] Run frontend admin bridge targeted tests:

```bash
pnpm --dir frontend exec vitest run src/features/admin-telegram-bridge src/features/admin-shell/pages/AdminTelegramBridgePage.test.tsx src/app/AppRoutes.admin.test.tsx
```

Expected result:

```text
Test Files  all passed
```

- [ ] Run backend build:

```bash
pnpm --dir backend build
```

Expected result:

```text
command exits 0
```

- [ ] Run backend lint:

```bash
pnpm --dir backend lint
```

Expected result:

```text
command exits 0
```

- [ ] Run repo-level checks required by AGENTS for production/runtime changes:

```bash
pnpm lint
pnpm build
git diff --check
```

Expected result:

```text
all commands exit 0
```

- [ ] Run production env validation:

```bash
./scripts/test-production-env-upgrade.sh
```

Expected result:

```text
command exits 0
```

- [ ] Run Compose config check from Task 9.

---

## Task 12: Production Cutover Procedure

**Files:**

- Read: `docs/operations/telegram-bridge.md`

- [ ] Confirm the second bot token and second Chatwoot Telegram inbox id.
- [ ] Confirm the first bot token/webhook is not used in any bridge config or webhook command.
- [ ] Deploy the production stack with the bridge service.
- [ ] Run database migrations.
- [ ] Verify the public bridge health route before configuring any Telegram webhook:

```bash
curl -fsS "<TELEGRAM_BRIDGE_PUBLIC_BASE_URL>/telegram-bridge/health"
```

- [ ] Log in to `/admin/integrations/telegram-bridge` for the test tenant.
- [ ] Create or update a test bridge config through the admin UI using the test Chatwoot inbox URL and test bot token.
- [ ] Verify the admin UI reports `Telegram bridge работает`.
- [ ] Send test private message from unknown test user and verify phone prompt.
- [ ] Send test self contact with a phone that exists in Chatwoot and verify link confirmation.
- [ ] Send test private message again and verify it appears in Chatwoot.
- [ ] Send test group message and verify it appears in Chatwoot with the author prefix.
- [ ] Reply from Chatwoot and verify Telegram group receives the reply.
- [ ] Record current webhook info for the second production bot before changing it:

```bash
pnpm --dir backend telegram-bridge:webhook:info --telegram-bot-token-file=/secure/path/to/production-bot-token
```

- [ ] Create or update the second production bot bridge config through `/admin/integrations/telegram-bridge`.
- [ ] Repeat minimal private and group smoke on production bot.
- [ ] Check `getWebhookInfo` for both bots and verify only the second bot points to bridge.
- [ ] Monitor bridge logs and Chatwoot logs for at least one delivery cycle.

---

## Independent Review Findings Integrated

The plan was reviewed independently before being written here. Integrated corrections:

- Require Telegram self-contact validation: `message.contact.user_id === message.from.id`.
- Use bridge-specific env names instead of generic `CHATWOOT_*`.
- Use `contacts/filter` with exact `phone_number`, not broad `contacts/search`.
- Add persistent `update_id` dedupe because Chatwoot webhook `200` only confirms enqueue.
- Require Telegram `secret_token` verification through `X-Telegram-Bot-Api-Secret-Token`.
- Add path secret, body limit, JSON-only POST, and generic error responses.
- Limit Telegram `allowed_updates` to `["message"]`; ignore edits in the first bridge version.
- Make group contact identity the group title; keep author only in message text/caption prefix.
- Mask token-bearing Chatwoot webhook URLs in logs.
- Document webhook ownership drift after Chatwoot Telegram inbox changes.
- Verify the first bot webhook remains untouched during cutover.

---

## Multitenancy And SMS Review Integrated

This plan was updated after reviewing the current tenant architecture and the preserved SMS fallback plan.

Integrated decisions:

- Bridge runtime is tenant-aware even for the first production bot.
- Tenant is resolved by `telegram_bridge_configs`, not by global env and not by Telegram request body.
- Global bridge env no longer contains Chatwoot account id, Chatwoot API token, Telegram bot token or Telegram inbox id.
- Bridge config stores Telegram secrets encrypted in portal DB and points to exactly one tenant.
- Dedupe is scoped by `telegram_bridge_config_id`, not by a free-form global key.
- Chatwoot Account API calls use the resolved tenant's Chatwoot runtime config.
- Phone normalization lives in shared `backend/src/lib/phone.ts`.
- Exact Chatwoot phone lookup lives in shared `backend/src/integrations/chatwoot/contactLookup.ts`.
- Future SMS fallback should reuse this shared lookup and supersede its deferred `contacts/search?q=` note with exact `contacts/filter` lookup.

Second independent review findings integrated:

- In-flight duplicate updates return retryable `503` instead of `200` unless durable `processed` is observed.
- CLI and runbook no longer pass secret values through argv; bot token comes from stdin/file and path/header secrets are generated by default.
- Full Chatwoot `contacts/filter` payload shape is fixed in the plan.
- Persisted delivery errors must be bounded and sanitized before storage.
- Public bridge health route must pass before any Telegram `setWebhook`.
- First bot safety check is against bridge configs and webhook commands, not only env.

Tenant admin setup update integrated:

- Portal admin UI is the primary setup path after the admin creates a Telegram inbox in Chatwoot.
- Tenant admin submits Chatwoot inbox URL and Telegram bot token through `/admin/integrations/telegram-bridge`.
- Portal backend verifies tenant admin session, tenant Chatwoot account ownership, Telegram inbox type and public bridge health before calling Telegram `setWebhook`.
- CLI setup remains available only as operator fallback and automation.

Third independent plan review findings integrated:

- Setup binds the submitted Telegram bot token to the selected Chatwoot Telegram inbox by comparing Telegram `getMe.username` with Chatwoot inbox `bot_name`.
- Non-secret Telegram bot id and username are stored, and non-archived bridge configs cannot reuse the same Telegram bot id.
- Admin setup and CLI configure read `getWebhookInfo` before `setWebhook` and reject unknown current webhook owners unless an explicit operator fallback override is used.
- Existing active bridge configs remain valid until `setWebhook` and post-write `getWebhookInfo` confirm the new bridge URL.
- Targeted test expected counts were corrected for multi-file commands.

---

## Acceptance Criteria

- The bridge works without Yandex Function, 1C, or S3.
- A tenant admin can create/update a working Telegram bridge from `/admin/integrations/telegram-bridge` by pasting the Chatwoot inbox URL and Telegram bot token.
- The browser never receives, stores or displays the Telegram bot token after setup submission.
- Setup rejects a Telegram bot token whose `getMe.username` does not match the selected Chatwoot Telegram inbox `bot_name`.
- Setup rejects a Telegram bot id already bound to another non-archived bridge config.
- Setup reads and classifies existing Telegram webhook ownership before `setWebhook`, and admin UI rejects unknown owners before mutation.
- Updating an existing bridge config cannot break the previous active config if `setWebhook` or post-write `getWebhookInfo` fails.
- The bridge can host multiple tenant-owned bridge configs without changing process env.
- A request for bridge config A cannot use tenant B Chatwoot account, token, inbox or contacts.
- Private Telegram users who already have a Chatwoot contact inbox link can message without phone prompt.
- Private Telegram users without a link are asked for their own phone number.
- Contact cards sent on behalf of another Telegram user are rejected.
- A matching Chatwoot contact phone creates the missing contact inbox link.
- Zero or multiple same-tenant Chatwoot contact phone matches do not create a Telegram contact inbox link.
- Group and supergroup messages appear in Chatwoot with author prefixes.
- Chatwoot replies to transformed group conversations still reach the Telegram group because transformed payloads keep the original numeric `message.chat.id`.
- Duplicate Telegram deliveries do not create duplicate Chatwoot messages.
- First Telegram bot remains unchanged.
- Shared phone normalization and Chatwoot exact phone lookup are reusable by future SMS fallback work.
- Production deploy and rollback steps are documented.
- Targeted tests, build, lint, env validation, Compose config, and `git diff --check` pass before commit.

---

## Recommended Execution

After approval, use `superpowers:subagent-driven-development` for Tasks 1-10 with review after each risky boundary:

- after database/dedupe;
- after Telegram transform;
- after Chatwoot client;
- after service orchestration;
- before production deploy.

Use a checkpoint commit after local verification and before production cutover.
